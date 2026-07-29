// kind別フィールド編集フォーム（M2・T-57。正本: docs/13 3.9節）。
// 「JSON手入力を廃止」（11の既知課題の解消）のため、実際に生成されている種別
// （vocab_card / audio_qa / text_blank・key_vocab_similar）はフィールド単位で編集できる
// ようにする。未知のkind（M2で今後追加されるdictation/shadowing/audio_set等）は
// 生JSONテキストエリアにフォールバックする（壊さないための安全網。専用フォームは
// それぞれのコンテンツ生成タスクで追加する）
import type { Choice, FreqRank, KeyVocab } from '@beb-raid/shared-schema'

type Payload = Record<string, unknown>

interface Props {
  kind: string
  payload: Payload
  onChange: (next: Payload) => void
}

const FREQ_RANKS: FreqRank[] = ['S', 'A', 'B', 'C']
const LEVEL_BANDS = [600, 730, 860, 990]

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  return (
    <label className="draft-field">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

function ChoicesEditor({
  choices,
  onChange,
}: {
  choices: Choice[]
  onChange: (next: Choice[]) => void
}) {
  function update(i: number, patch: Partial<Choice>) {
    onChange(choices.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function remove(i: number) {
    onChange(choices.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...choices, { key: '', text: '' }])
  }
  return (
    <div className="draft-choices">
      <p>選択肢</p>
      {choices.map((c, i) => (
        <div key={i} className="draft-choices__row">
          <input
            aria-label={`選択肢${i + 1}のキー`}
            value={c.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            aria-label={`選択肢${i + 1}の本文`}
            value={c.text}
            onChange={(e) => update(i, { text: e.target.value })}
          />
          <button type="button" onClick={() => remove(i)}>
            削除
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        選択肢を追加
      </button>
    </div>
  )
}

function KeyVocabEditor({
  keyVocab,
  onChange,
}: {
  keyVocab: KeyVocab[]
  onChange: (next: KeyVocab[]) => void
}) {
  function update(i: number, patch: Partial<KeyVocab>) {
    onChange(keyVocab.map((k, idx) => (idx === i ? { ...k, ...patch } : k)))
  }
  function remove(i: number) {
    onChange(keyVocab.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...keyVocab, { word: '', sense: '', freqRank: 'S' }])
  }
  return (
    <div className="draft-keyvocab">
      <p>key単語</p>
      {keyVocab.map((k, i) => (
        <div key={i} className="draft-keyvocab__row">
          <input
            aria-label={`key単語${i + 1}の単語`}
            value={k.word}
            onChange={(e) => update(i, { word: e.target.value })}
          />
          <input
            aria-label={`key単語${i + 1}の意味`}
            value={k.sense}
            onChange={(e) => update(i, { sense: e.target.value })}
          />
          <select
            aria-label={`key単語${i + 1}の頻出度`}
            value={k.freqRank}
            onChange={(e) => update(i, { freqRank: e.target.value as FreqRank })}
          >
            {FREQ_RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => remove(i)}>
            削除
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        key単語を追加
      </button>
    </div>
  )
}

function str(payload: Payload, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v : ''
}

function VocabCardForm({ payload, onChange }: Props) {
  const phraseAudio = str(payload, 'phraseAudio')
  return (
    <div className="draft-form">
      <TextField
        label="front（対象語）"
        value={str(payload, 'front')}
        onChange={(v) => onChange({ ...payload, front: v })}
      />
      <TextField
        label="phrase（フレーズ）"
        value={str(payload, 'phrase')}
        onChange={(v) => onChange({ ...payload, phrase: v })}
      />
      <TextField
        label="back（意味）"
        value={str(payload, 'back')}
        onChange={(v) => onChange({ ...payload, back: v })}
      />
      <label className="draft-field">
        freqRank
        <select
          value={str(payload, 'freqRank') || 'S'}
          onChange={(e) => onChange({ ...payload, freqRank: e.target.value })}
        >
          {FREQ_RANKS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="draft-field">
        levelBand
        <select
          value={String(payload.levelBand ?? 600)}
          onChange={(e) => onChange({ ...payload, levelBand: Number(e.target.value) })}
        >
          {LEVEL_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      {phraseAudio && (
        <div className="draft-audio-preview">
          <p>音声プレビュー（{phraseAudio}）</p>
          <audio controls src={`/content-assets/${phraseAudio}`} />
        </div>
      )}
    </div>
  )
}

/**
 * 応答ごとの区間プレビュー用のセグメント（T-152）。
 * audioMeta.responseOffsetsMs は読み上げ順（key昇順）の開始msなので、
 * 各応答の終端は「次の応答の開始」または「全長」になる。
 * 音声のみモード非対応（オフセット無し）や整合しないデータでは null を返す
 */
function part2ResponseSegments(
  payload: Record<string, unknown>,
  choices: readonly Choice[],
): { key: string; text: string; startMs: number; endMs: number }[] | null {
  const meta = payload.audioMeta
  if (typeof meta !== 'object' || meta === null) return null
  const { responseOffsetsMs, durationMs } = meta as {
    responseOffsetsMs?: unknown
    durationMs?: unknown
  }
  if (!Array.isArray(responseOffsetsMs) || typeof durationMs !== 'number') return null
  if (responseOffsetsMs.length !== choices.length) return null
  const sorted = [...choices].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return sorted.map((choice, i) => ({
    key: choice.key,
    text: choice.text,
    startMs: responseOffsetsMs[i] as number,
    endMs: (responseOffsetsMs[i + 1] as number | undefined) ?? durationMs,
  }))
}

function ChoiceBasedForm({ kind, payload, onChange }: Props) {
  const isAudioQa = kind === 'audio_qa'
  const audio = str(payload, 'audio')
  const choices = (Array.isArray(payload.choices) ? (payload.choices as Choice[]) : []) as Choice[]
  const responseSegments = isAudioQa ? part2ResponseSegments(payload, choices) : null
  const keyVocab = (
    Array.isArray(payload.keyVocab) ? (payload.keyVocab as KeyVocab[]) : []
  ) as KeyVocab[]

  return (
    <div className="draft-form">
      {isAudioQa ? (
        <TextField
          label="script（設問 — 応答）"
          value={str(payload, 'script')}
          onChange={(v) => onChange({ ...payload, script: v })}
          multiline
        />
      ) : (
        <TextField
          label="question（設問文）"
          value={str(payload, 'question')}
          onChange={(v) => onChange({ ...payload, question: v })}
          multiline
        />
      )}
      <ChoicesEditor
        choices={choices}
        onChange={(next) => onChange({ ...payload, choices: next })}
      />
      <TextField
        label="answer（正解キー）"
        value={str(payload, 'answer')}
        onChange={(v) => onChange({ ...payload, answer: v })}
      />
      <TextField
        label="explanation（解説）"
        value={str(payload, 'explanation')}
        onChange={(v) => onChange({ ...payload, explanation: v })}
        multiline
      />
      <TextField
        label="translation（和訳）"
        value={str(payload, 'translation')}
        onChange={(v) => onChange({ ...payload, translation: v })}
        multiline
      />
      <TextField
        label="tags（カンマ区切り）"
        value={(Array.isArray(payload.tags) ? (payload.tags as string[]) : []).join(', ')}
        onChange={(v) =>
          onChange({
            ...payload,
            tags: v
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t !== ''),
          })
        }
      />
      <KeyVocabEditor
        keyVocab={keyVocab}
        onChange={(next) => onChange({ ...payload, keyVocab: next })}
      />
      {isAudioQa && audio && (
        <div className="draft-audio-preview">
          <p>音声プレビュー（{audio}）</p>
          <audio controls src={`/content-assets/${audio}`} />
          {responseSegments && (
            <>
              {/* T-152: 音声のみモード用に「設問＋3応答」を連結した音声は、応答ごとの
                  区間を聞き分けないと読み上げ順と key の対応を検品できない。
                  media fragment（#t=開始,終了）で区間だけ再生する */}
              <p className="draft-form__note">
                応答ごとの区間プレビュー（読み上げ順＝key昇順。**選択肢テキストを編集したら
                応答音声の再生成が必要**で、そのままではビルドがdigest不一致で止まる）
              </p>
              <ul className="draft-response-previews">
                {responseSegments.map((seg) => (
                  <li key={seg.key}>
                    <span>
                      {seg.key}: {seg.text}
                    </span>
                    <audio
                      controls
                      src={`/content-assets/${audio}#t=${(seg.startMs / 1000).toFixed(2)},${(seg.endMs / 1000).toFixed(2)}`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GenericJsonForm({ payload, onChange }: Props) {
  return (
    <div className="draft-form">
      <p className="draft-form__note">
        未対応の種別のため生JSON編集にフォールバックしています（専用フォームは今後追加予定）
      </p>
      <textarea
        className="draft-form__raw-json"
        rows={16}
        defaultValue={JSON.stringify(payload, null, 2)}
        onBlur={(e) => {
          try {
            onChange(JSON.parse(e.target.value) as Payload)
          } catch {
            // JSON化できない編集中の状態は無視する（blur時点で壊れたJSONを反映しない）
          }
        }}
      />
    </div>
  )
}

const CHOICE_BASED_KINDS = new Set(['audio_qa', 'text_blank', 'key_vocab_similar'])

export function DraftForm(props: Props) {
  if (props.kind === 'vocab_card') return <VocabCardForm {...props} />
  if (CHOICE_BASED_KINDS.has(props.kind)) return <ChoiceBasedForm {...props} />
  return <GenericJsonForm {...props} />
}
