// Vitest（jsdom）共通セットアップ（packages/appのsetup.tsと同型）。
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
