import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('backend runtime dependencies', () => {
  it('declares undici because production workers import it directly', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string> }

    expect(packageJson.dependencies?.undici).toBeDefined()
  })
})
