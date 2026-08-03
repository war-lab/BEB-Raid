// S8 イベントバトルホスト画面（M4・T-126。正本: docs/22_M4実装計画.md 3.2節・3.6節、docs/02 6.1節・6.2節、
// docs/05 4.2節）。
// ルーム作成→出題セット抽選プレビュー（再抽選可）→参加者が揃ったら開始→
// 問題投影（音声再生完了後にopenQuestion送信）→カウントダウン→各問順位→最終順位・
// ベストグロース表彰、の一連。ホストは参加者として解答しない（進行専任。3.6節末尾）。
// BattleRoomDOはコンテンツ非依存のため、出題セットの抽選・問題文/選択肢の表示・
// 音声再生の判断はすべてこの画面（ホスト端末のローカルパック）が担う
import { useEffect, useRef, useState } from 'react'
import type { BattleServerMessage, Question } from '@beb-raid/shared-schema'
import { drawBattleQuestionSet } from '../engine/battleLottery'
import type { AudioPlayer, BattleSocket, RaidApi } from '../platform'
import { useAppStore } from '../store/appStore'
import { BattleAward } from '../components/BattleAward'
import { choiceShapeMarker } from '../components/ChoiceButton'
import { HostProjectionLayout } from '../components/HostProjectionLayout'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { StandingsList } from '../components/StandingsList'
import { getTheme, setTheme } from '../theme'
import { resolveBattleCloseMessage } from './battleCloseMessage'

interface Props {
  raidApi: RaidApi
  battleSocket: BattleSocket
  audioPlayer: AudioPlayer
  /** 出題抽選のプール（キャッシュ済み配信パック由来。App.tsxのquestionPoolをそのまま渡す） */
  questionPool: Question[]
  /** 抽選rng（省略時Math.random。テストで決定的に検証するための注入口） */
  rng?: () => number
}

type Phase =
  'setup' | 'creating' | 'lobby' | 'presenting' | 'question' | 'standings' | 'result' | 'closed'

interface StandingRow {
  displayName: string
  totalPoints: number
}

function now(): number {
  return Date.now()
}

/**
 * 投影する問題文。**script は絶対に投影しない**。
 * 音声問題（Part2等）の script は読み上げ原稿で、質問文と正答の両方を含む
 * （例: 「When should I submit the expense report? — By the end of this week.」）。
 * これを投影すると、リスニング問題が読解問題になるだけでなく**正答が画面に出る**。
 * T-126が audioMeta.questionEndMs で音声を質問部の終端で打ち切って正答読み上げの
 * リークを防いでいるのと同じ理由で、テキスト側でも漏らしてはならない。
 * question を持たない設問では、DrillScreenの音声問題と同じ趣旨のプロンプトを出す
 */
/**
 * 抽選プレビューの1行。ここでも **script は出さない**。
 * ルーム作成前のホストの下見だが、プレビューを映したまま参加者が居ると正答が漏れる
 * （V-17のスクリーンショット確認で独立に再指摘された）。
 * 音声問題は行を区別できる必要があるため、種別とidで示す
 */
function lotteryPreviewText(question: Question): string {
  return question.question ?? `音声問題（${question.id}）`
}

function projectedQuestionText(question: Question): string {
  if (question.question) return question.question
  return '音声で質問が流れます。応答として正しい選択肢を選んでください'
}

export function BattleHostScreen({ raidApi, battleSocket, audioPlayer, questionPool, rng }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const [phase, setPhase] = useState<Phase>('setup')
  const [questionSet, setQuestionSet] = useState<Question[]>(() =>
    drawBattleQuestionSet(questionPool, rng),
  )
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  /**
   * 音声問題の再生状態（発起人の要望、2026-08-03）。
   * 'waiting'=ホストの再生タップ待ち / 'playing'=再生中 / 'none'=音声なし・再生済み。
   * 自動再生をやめて1タップ挟むための状態で、詳細は presentQuestion のコメント参照
   */
  const [audioGate, setAudioGate] = useState<'none' | 'waiting' | 'playing'>('none')
  /**
   * 再生開始の同期ガード。連打は同一レンダー内で2回目のクリックが来るため、
   * state（audioGate）では間に合わない（openQuestionが2回送られ、締切表示が飛ぶ）
   */
  const audioStartedRef = useRef(false)
  const [remainingSec, setRemainingSec] = useState(0)
  /** 外周リングの満量（この問の制限秒数）。questionOpen受信時点の残秒数から算出する */
  const [totalSec, setTotalSec] = useState(1)
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [resultEntries, setResultEntries] = useState<StandingRow[]>([])
  const [bestGrowthName, setBestGrowthName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** サーバーが付与した切断理由（closed表示の案内文の出し分けに使う。通信断時は空文字） */
  const [closeReason, setCloseReason] = useState('')

  const closeQuestionSentRef = useRef(false)

  useEffect(() => {
    battleSocket.onMessage((message: BattleServerMessage) => {
      if (message.type === 'roomState') {
        setParticipants(message.participants.map((p) => p.displayName))
        return
      }
      if (message.type === 'questionOpen') {
        closeQuestionSentRef.current = false
        setDeadlineAt(message.deadlineAt)
        // 外周リングは「残り/制限」の比で描くため、受信時点の残秒数を満量として覚える
        // （制限秒数はプロトコルに無い。DO側タイマーが正である点は変えない=22の3.2節）
        setTotalSec(Math.max(1, Math.ceil((message.deadlineAt - now()) / 1000)))
        setPhase('question')
        return
      }
      if (message.type === 'standings') {
        setStandings(message.entries)
        setPhase('standings')
        return
      }
      if (message.type === 'result') {
        setResultEntries(message.entries)
        setBestGrowthName(message.bestGrowth.displayName)
        setPhase('result')
        return
      }
      if (message.type === 'error') {
        setErrorMessage(`エラーが発生しました（${message.code}）`)
      }
    })
    battleSocket.onClose((event) => {
      // 切断理由を保持して案内文を出し分ける（未登録・ルーム不在・終了・通信断）
      setCloseReason(event.reason)
      setPhase((p) => (p === 'result' ? p : 'closed'))
    })
  }, [battleSocket])

  // JV-6（承認済み・案A）: プロジェクターは黒を投影できないため、ホスト画面のみ明地にする。
  // 明地の値はライトテーマのトークン（AA検証済み。docs/20 V-7の表）をそのまま使いたいので、
  // 新しい地色トークンを増やさず（docs/25 5節）、この画面の表示中だけ data-theme を
  // ライトへ固定し、離脱時に元のテーマへ戻す
  useEffect(() => {
    const previousTheme = getTheme()
    setTheme('light')
    return () => setTheme(previousTheme)
  }, [])

  // 画面を離れるときは必ずWebSocketを閉じる（battleSocketはApp.tsxのモジュール単位
  // シングルトンのため、閉じ忘れるとホーム遷移後もホスト接続が残る）
  useEffect(() => {
    return () => battleSocket.close()
  }, [battleSocket])

  // 出題中のカウントダウン。0になったらホストが closeQuestion を送る
  // （DO側タイマーが正=22の3.2節。ホストのタイマーは締切送信の契機に過ぎない）
  useEffect(() => {
    if (phase !== 'question' || deadlineAt === null) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - now()) / 1000))
      setRemainingSec(remaining)
      if (remaining === 0 && currentIndex >= 0 && !closeQuestionSentRef.current) {
        closeQuestionSentRef.current = true
        battleSocket.send({ type: 'closeQuestion', questionIndex: currentIndex })
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, deadlineAt, currentIndex, battleSocket])

  async function handleRedraw() {
    setQuestionSet(drawBattleQuestionSet(questionPool, rng))
  }

  async function handleCreateRoom() {
    setErrorMessage(null)
    setPhase('creating')
    try {
      const code = await raidApi.createBattleRoom()
      setRoomCode(code)
      battleSocket.connect(code)
      setPhase('lobby')
    } catch (e) {
      console.error('[BattleHostScreen] ルーム作成に失敗', e)
      setErrorMessage('ルームの作成に失敗しました')
      setPhase('setup')
    }
  }

  /**
   * 指定indexの問題を投影する。音声のある問題（Part2=audio_qa）は再生完了後に、
   * 音声の無い問題（Part5=text_blank）は表示と同時に openQuestion を送る
   * （05の4.2節「再生完了イベントで解答受付を開く」。22の6節T-126シート）。
   *
   * **音声は自動再生しない**（発起人の要望、2026-08-03）。「次の問題へ」を押した瞬間に
   * 流れると、会場の注意がまだ前問の順位表に向いている状態で1問目の応答が過ぎてしまう。
   * ホストが会場を見て合図を出せるよう、再生開始のタップを1つ挟む
   */
  function presentQuestion(index: number) {
    const question = questionSet[index]
    if (!question) return
    setCurrentIndex(index)
    setCurrentQuestion(question)
    setDeadlineAt(null)
    setPhase('presenting')

    if (question.audio) {
      audioStartedRef.current = false
      setAudioGate('waiting')
      return
    }
    setAudioGate('none')
    battleSocket.send({ type: 'openQuestion', questionIndex: index, questionId: question.id })
  }

  /**
   * 投影中の音声問題を再生し、再生完了で解答受付を開く（openQuestionの送信）。
   * 再生の失敗でも受付は開く（従来と同じ。音声が出ない場でも進行は止めない）
   */
  async function handlePlayQuestionAudio() {
    const question = currentQuestion
    // 二度押しは無視する（1問につき openQuestion は1回だけ送る）
    if (!question?.audio || audioStartedRef.current || audioGate !== 'waiting') return
    audioStartedRef.current = true
    setAudioGate('playing')
    try {
      await audioPlayer.unlock()
      const questionEndMs = question.audioMeta?.questionEndMs
      await audioPlayer.play(
        question.audio,
        typeof questionEndMs === 'number' ? { durationMs: questionEndMs } : undefined,
      )
    } catch (e) {
      console.warn('[BattleHostScreen] 音声再生に失敗。解答受付は開始する', e)
    }
    setAudioGate('none')
    battleSocket.send({
      type: 'openQuestion',
      questionIndex: currentIndex,
      questionId: question.id,
    })
  }

  function handleStart() {
    presentQuestion(0)
  }

  function handleNext() {
    if (currentIndex + 1 < questionSet.length) {
      presentQuestion(currentIndex + 1)
    }
  }

  function handleFinish() {
    battleSocket.send({ type: 'finish' })
  }

  function handleLeave() {
    battleSocket.close()
    navigate('home')
  }

  const isLastQuestion = currentIndex + 1 >= questionSet.length
  // 投影の左上に出す進行位置（英字。ディスプレイ書体で読ませる）
  const questionMeta = `Q${currentIndex + 1} / ${questionSet.length}`
  const part2Count = questionSet.filter((q) => q.part === 2).length
  const part5Count = questionSet.filter((q) => q.part === 5).length

  if (phase === 'setup' || phase === 'creating') {
    return (
      <ScreenLayout
        status={<p>イベントバトルを主催</p>}
        action={
          <>
            <PrimaryButton onClick={() => void handleCreateRoom()} disabled={phase === 'creating'}>
              ルームを作成
            </PrimaryButton>
            <button type="button" className="secondary-action" onClick={handleRedraw}>
              再抽選
            </button>
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              やめる
            </button>
          </>
        }
      >
        {/* docs/26 A-5: この画面は ScreenLayout（モバイル用）のまま1920pxのPCで開かれるため、
            12行の一覧が全幅に間延びして注記サイズの文字で並んでいた。JV-10=案Bの決定
            （抽選プレビューは投影せず、ホストが手元で読む画面）は変えず、読み物としての
            体裁だけ整える: 読み幅を人の可読幅で止め、面と行の階層を付ける。
            投影スケール（--host-fs-*）は使わない＝投影対象に格上げしていない */}
        <div className="battle-lottery">
          <p className="battle-lottery__label">QUESTION SET</p>
          <p data-testid="battle-host-lottery-summary" className="battle-lottery__summary">
            出題セット: Part2 {part2Count}問 / Part5 {part5Count}問（計{questionSet.length}問）
          </p>
          <ol className="battle-lottery__list" data-testid="battle-host-lottery-preview">
            {questionSet.map((q, i) => (
              <li key={q.id} className="battle-lottery__item">
                <span className="battle-lottery__num display-num">{i + 1}</span>
                <span className="battle-lottery__part">Part{q.part}</span>
                <span className="battle-lottery__text">{lotteryPreviewText(q)}</span>
              </li>
            ))}
          </ol>
        </div>
        {errorMessage && (
          <p className="drill-error" role="alert">
            {errorMessage}
          </p>
        )}
      </ScreenLayout>
    )
  }

  if (phase === 'lobby') {
    // ロビーは投影に映る（参加者全員がルームコードを見て入室する）ため、投影レイアウトで組む
    // （V-22。JV-10=案Bで承認。抽選プレビュー=setupはホストが手元で読む画面なので対象外）。
    // 従来はモバイル用の ScreenLayout で、1920px幅にルームコードが小さな見出しで出るため
    // 後方の席から読めなかった（V-20の指摘#1）
    return (
      <HostProjectionLayout
        meta="LOBBY"
        action={
          <>
            <PrimaryButton onClick={handleStart}>開始する</PrimaryButton>
            <button type="button" className="secondary-action" onClick={handleLeave}>
              やめる
            </button>
          </>
        }
      >
        <div className="battle-host-lobby">
          <p className="battle-host-lobby__label">ROOM CODE</p>
          <p
            data-testid="battle-host-room-code"
            className="battle-host-lobby__code display-num"
            /* 4文字を1字ずつ読み上げさせる（RA1D を「ラッド」と読まれると口伝えできない） */
            aria-label={roomCode ? roomCode.split('').join(' ') : undefined}
          >
            {roomCode}
          </p>
          <p className="battle-host-lobby__hint">参加者にルームコードを伝えてください</p>
          <ul className="battle-lobby__chips" data-testid="battle-host-participants">
            {/* 表示名は重複しうる（同名の参加者）ためkeyには使わず、サーバー送出順のindexを使う */}
            {participants.map((name, i) => (
              <li key={i} className="battle-lobby__chip">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </HostProjectionLayout>
    )
  }

  // 以下、投影に映るフェーズ（音声再生中・出題中・途中順位・最終リザルト）はモバイル用の
  // ScreenLayout を使わず HostProjectionLayout で組む（docs/25 4.3節・JV-5）
  if (phase === 'presenting') {
    // 再生タップ待ちの間は投影に「まだ流れていない」ことを出す（会場が音を待って
    // 静まる前に流れてしまうのを避けるための1拍。presentQuestion のコメント参照）
    const waitingForPlay = audioGate === 'waiting'
    return (
      <HostProjectionLayout
        meta={questionMeta}
        action={
          waitingForPlay ? (
            <PrimaryButton onClick={() => void handlePlayQuestionAudio()}>音声を再生</PrimaryButton>
          ) : (
            <p className="battle-host-stage__note">再生完了後に解答受付が開きます</p>
          )
        }
      >
        <p className="battle-host-stage__phase">
          {waitingForPlay ? '準備ができたら再生してください' : '音声再生中…'}
        </p>
        {currentQuestion && (
          <p className="battle-host-question">{projectedQuestionText(currentQuestion)}</p>
        )}
      </HostProjectionLayout>
    )
  }

  if (phase === 'question') {
    return (
      <HostProjectionLayout
        meta={questionMeta}
        remainingSec={remainingSec}
        totalSec={totalSec}
        action={<p className="battle-host-stage__note">参加者が解答中です</p>}
      >
        {currentQuestion && (
          <>
            <p className="battle-host-question">{projectedQuestionText(currentQuestion)}</p>
            {/* 選択肢は「形＋色＋記号」の三重符号化。色（キーごとのアクセント）はV-11が
                data-choice-key で当て、形マーカー（▲■●◆）はV-12が同じ器の中身として
                載せた（docs/25 4.4節・JV-7=案B）。形の対応表は ChoiceButton と共有するため、
                手元画面（S7）と同じ形が同じ選択肢に付く。記号A–Dは投影では形に置き換わり、
                visually-hidden で支援技術に残す。
                出題中は演出を足さない（07の原則3・docs/25 4.4節末尾） */}
            <ul className="battle-host-choices">
              {currentQuestion.choices?.map((choice) => (
                <li key={choice.key} className="battle-host-choice" data-choice-key={choice.key}>
                  <span className="battle-host-choice__marker display-num" aria-hidden="true">
                    {choiceShapeMarker(choice.key) ?? choice.key}
                  </span>
                  <span className="battle-host-choice__text">{choice.text}</span>
                  {/* 記号を装飾扱いにしたぶんの読み上げ（投影画面は読み上げ対象外だが、
                      ホスト端末の支援技術で選択肢が判別できるようにしておく） */}
                  <span className="visually-hidden">{choice.key}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </HostProjectionLayout>
    )
  }

  if (phase === 'standings') {
    return (
      <HostProjectionLayout
        meta={`${questionMeta} DONE`}
        action={
          isLastQuestion ? (
            <PrimaryButton onClick={handleFinish}>結果発表</PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleNext}>次の問題へ</PrimaryButton>
          )
        }
      >
        {/* ホストは解答しないため自分の行が無い（selfDisplayNameを渡さない）。
            投影用のサイズ差は.battle-host配下のCSSで上書きする（docs/25 4.1節）。
            .battle-host は HostProjectionLayout のルートが持つ */}
        <StandingsList entries={standings} listTestId="battle-host-standings" />
      </HostProjectionLayout>
    )
  }

  if (phase === 'result') {
    return (
      <HostProjectionLayout
        // 順位表側の英字ラベルが「FINAL RESULT」なので、メタは進行位置の締めに留める
        meta={`${questionMeta} FINAL`}
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
      >
        {/* 表彰（表彰台・ベストグロース賞・段階開示）はV-10のBattleAwardが持つ。
            上位3名は表彰台に載るため順位表は4位以下だけを描く（fromRank=4）。
            ホストは解答しないためselfDisplayNameは渡さない（docs/25 4.1節・4.2節） */}
        {/* 最終リザルトは表彰台＋ベストグロース賞＋4位以下が縦に積むため、参加者が増えると
            1080pの縦を使い切る。4位以下の行だけ得点スケールを下げて行数を稼ぎ（表彰台は
            6vwを維持して見せ場を保つ）、それでも収まらない場合は
            .battle-host-stage__body のスクロールで受ける（2段構え。発起人判断） */}
        <div className="battle-host-final">
          <StandingsList
            entries={resultEntries}
            label="FINAL RESULT"
            fromRank={4}
            listTestId="battle-host-result"
          >
            <BattleAward
              entries={resultEntries}
              bestGrowthName={bestGrowthName}
              bestGrowthTestId="battle-host-best-growth"
            />
          </StandingsList>
        </div>
      </HostProjectionLayout>
    )
  }

  // closed（参加者切断は無関係。ホスト自身の切断・エラー等のクローズ）。
  // 理由ごとに原因と次にとる行動を出す
  const closeMessage = resolveBattleCloseMessage(closeReason, 'host')
  return (
    <ScreenLayout
      status={<p>{closeMessage.title}</p>}
      action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
    >
      <p data-testid="battle-host-close-reason">{closeMessage.body}</p>
    </ScreenLayout>
  )
}
