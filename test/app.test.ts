import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { Config } from '../src/config.js'
import type { ImageProvider } from '../src/providers/provider.js'

const baseConfig: Config = {
  HOST: '127.0.0.1',
  PORT: 8787,
  CODEX_BIN: 'codex',
  GENERATION_TIMEOUT_MS: 30_000,
  MAX_CONCURRENT_GENERATIONS: 1,
}

function mockProvider(overrides: Partial<ImageProvider> = {}): ImageProvider {
  return {
    capabilities: {
      id: 'mock',
      authentication: 'subscription',
      formats: ['png', 'jpeg', 'webp'],
      maxWidth: 4096,
      maxHeight: 4096,
    },
    generate: vi.fn(async (request, _signal) => ({
      buffer: Buffer.from(`mock:${request.width}x${request.height}`),
      mimeType: 'image/png' as const,
      provider: 'mock',
      model: 'mock-model',
    })),
    ...overrides,
  }
}

describe('GET /health', () => {
  it('returns ok status with zero active generations', async () => {
    const app = createApp(baseConfig, [mockProvider()])
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', activeGenerations: 0 })
  })
})

describe('GET /v1/capabilities', () => {
  it('lists all registered providers', async () => {
    const providers = [
      mockProvider({ capabilities: { ...mockProvider().capabilities, id: 'codex' } }),
      mockProvider({ capabilities: { ...mockProvider().capabilities, id: 'claude' } }),
    ]
    const app = createApp(baseConfig, providers)
    const res = await app.request('/v1/capabilities')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { providers: Array<{ id: string }> }
    expect(body.providers).toHaveLength(2)
    expect(body.providers.map((p) => p.id)).toEqual([
      'codex',
      'claude',
    ])
  })
})

describe('POST /v1/images/generate', () => {
  it('returns raw image bytes with correct headers', async () => {
    const provider = mockProvider()
    const app = createApp(baseConfig, [provider])
    const res = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'test image',
        width: 512,
        height: 512,
        format: 'png',
        provider: 'mock',
      }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-image-provider')).toBe('mock')
    expect(res.headers.get('x-image-model')).toBe('mock-model')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Buffer.from(bytes).toString()).toBe('mock:512x512')
  })

  it('passes the parsed request to the provider', async () => {
    const provider = mockProvider()
    const app = createApp(baseConfig, [provider])
    await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'retro poster',
        width: 1536,
        height: 1024,
        format: 'webp',
        provider: 'mock',
        model: 'test-model',
      }),
    })
    expect(provider.generate).toHaveBeenCalledOnce()
    const [request] = vi.mocked(provider.generate).mock.calls[0]! 
    expect(request.prompt).toBe('retro poster')
    expect(request.width).toBe(1536)
    expect(request.height).toBe(1024)
    expect(request.format).toBe('webp')
    expect(request.model).toBe('test-model')
  })

  it('passes ordered image references to the provider', async () => {
    const provider = mockProvider()
    const app = createApp(baseConfig, [provider])
    await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'blend these references',
        width: 512,
        height: 512,
        provider: 'mock',
        references: [
          { data: 'aW1hZ2Utb25l', mimeType: 'image/png' },
          { data: 'aW1hZ2UtdHdv', mimeType: 'image/webp' },
        ],
      }),
    })
    const [request] = vi.mocked(provider.generate).mock.calls[0]!
    expect(request.references).toEqual([
      { data: 'aW1hZ2Utb25l', mimeType: 'image/png' },
      { data: 'aW1hZ2UtdHdv', mimeType: 'image/webp' },
    ])
  })

  it('rejects invalid JSON with 400', async () => {
    const app = createApp(baseConfig, [mockProvider()])
    const res = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it.each([
    ['empty prompt', { prompt: '', width: 512, height: 512 }],
    ['missing prompt', { width: 512, height: 512 }],
    ['width too small', { prompt: 'x', width: 128, height: 512 }],
    ['height too small', { prompt: 'x', width: 512, height: 128 }],
    ['width too large', { prompt: 'x', width: 8192, height: 512 }],
    ['height too large', { prompt: 'x', width: 512, height: 8192 }],
  ])('rejects invalid request (%s) with 400', async (_label, body) => {
    const app = createApp(baseConfig, [mockProvider()])
    const res = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(400)
  })

  it('rejects unknown provider with 400', async () => {
    const app = createApp(baseConfig, [mockProvider()])
    const res = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'x',
        width: 512,
        height: 512,
        provider: 'nonexistent',
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { message: string; providers: string[] } }
    expect(body.error.message).toContain('nonexistent')
    expect(body.error.providers).toContain('mock')
  })

  it('returns 502 when the provider throws', async () => {
    const provider = mockProvider({
      generate: vi.fn(async () => {
        throw new Error('generation exploded')
      }),
    })
    const app = createApp(baseConfig, [provider])
    const res = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'x',
        width: 512,
        height: 512,
        provider: 'mock',
      }),
    })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('generation exploded')
  })

  it('returns 429 when concurrency capacity is full', async () => {
    const config = { ...baseConfig, MAX_CONCURRENT_GENERATIONS: 1 }
    let release: (() => void) | undefined
    const provider = mockProvider({
      generate: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                buffer: Buffer.from('x'),
                mimeType: 'image/png' as const,
                provider: 'mock',
              })
          }),
      ) as ImageProvider['generate'],
    })
    const app = createApp(config, [provider])

    // Start first generation (occupies the single slot)
    const first = app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'first', width: 512, height: 512, provider: 'mock' }),
    })

    // Wait a tick so the first request enters the gate
    await new Promise((r) => setTimeout(r, 10))

    const second = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'second', width: 512, height: 512, provider: 'mock' }),
    })
    expect(second.status).toBe(429)

    release?.()
    await first
  })

  it('requires a bearer token when configured', async () => {
    const config = {
      ...baseConfig,
      SUBSCRIPTION_IMAGE_TOKEN: 'a-very-secure-token',
    }
    const app = createApp(config, [mockProvider()])

    // No token → 401
    const noToken = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x', width: 512, height: 512, provider: 'mock' }),
    })
    expect(noToken.status).toBe(401)

    // Wrong token → 401
    const wrongToken = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({ prompt: 'x', width: 512, height: 512, provider: 'mock' }),
    })
    expect(wrongToken.status).toBe(401)

    // Correct token → 200
    const correctToken = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer a-very-secure-token',
      },
      body: JSON.stringify({ prompt: 'x', width: 512, height: 512, provider: 'mock' }),
    })
    expect(correctToken.status).toBe(200)
  })

  it('defaults format to png and provider to codex when omitted', async () => {
    const provider = mockProvider({
      capabilities: { ...mockProvider().capabilities, id: 'codex' },
    })
    const app = createApp(baseConfig, [provider])
    const res = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x', width: 512, height: 512 }),
    })
    expect(res.status).toBe(200)
    const [request] = vi.mocked(provider.generate).mock.calls[0]!
    expect(request.format).toBe('png')
    expect(request.provider).toBe('codex')
  })
})

describe('404 handler', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const app = createApp(baseConfig, [mockProvider()])
    const res = await app.request('/unknown')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('not found')
  })
})
