import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('applies defaults for missing values', () => {
    const config = loadConfig({})
    expect(config.HOST).toBe('127.0.0.1')
    expect(config.PORT).toBe(8787)
    expect(config.CODEX_BIN).toBe('codex')
    expect(config.GENERATION_TIMEOUT_MS).toBe(180_000)
    expect(config.MAX_CONCURRENT_GENERATIONS).toBe(1)
    expect(config.SUBSCRIPTION_IMAGE_TOKEN).toBeUndefined()
  })

  it('reads values from the environment', () => {
    const config = loadConfig({
      HOST: '0.0.0.0',
      PORT: '9999',
      CODEX_BIN: '/usr/local/bin/codex',
      GENERATION_TIMEOUT_MS: '300000',
      MAX_CONCURRENT_GENERATIONS: '4',
      SUBSCRIPTION_IMAGE_TOKEN: 'secure-token-12345678',
    })
    expect(config.HOST).toBe('0.0.0.0')
    expect(config.PORT).toBe(9999)
    expect(config.CODEX_BIN).toBe('/usr/local/bin/codex')
    expect(config.GENERATION_TIMEOUT_MS).toBe(300_000)
    expect(config.MAX_CONCURRENT_GENERATIONS).toBe(4)
    expect(config.SUBSCRIPTION_IMAGE_TOKEN).toBe('secure-token-12345678')
  })

  it('allows loopback without a token', () => {
    expect(() => loadConfig({ HOST: '127.0.0.1' })).not.toThrow()
    expect(() => loadConfig({ HOST: '::1' })).not.toThrow()
  })

  it('requires a token for non-loopback hosts', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow(
      'SUBSCRIPTION_IMAGE_TOKEN is required',
    )
  })

  it('rejects tokens shorter than 16 characters', () => {
    expect(() =>
      loadConfig({ HOST: '0.0.0.0', SUBSCRIPTION_IMAGE_TOKEN: 'short' }),
    ).toThrow()
  })

  it.each([
    ['PORT', { PORT: '0' }],
    ['PORT', { PORT: '70000' }],
    ['GENERATION_TIMEOUT_MS', { GENERATION_TIMEOUT_MS: '5000' }],
    ['MAX_CONCURRENT_GENERATIONS', { MAX_CONCURRENT_GENERATIONS: '0' }],
    ['MAX_CONCURRENT_GENERATIONS', { MAX_CONCURRENT_GENERATIONS: '9' }],
  ])('rejects out-of-range %s', (_field, env) => {
    expect(() => loadConfig(env)).toThrow()
  })
})
