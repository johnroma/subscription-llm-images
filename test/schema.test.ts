import { describe, expect, it } from 'vitest'
import { generationRequestSchema, imageFormatSchema } from '../src/schema.js'

describe('generationRequestSchema', () => {
  const valid = {
    prompt: 'a vintage travel poster of Lisbon',
    width: 1536,
    height: 1024,
  }

  it('parses a valid request with defaults', () => {
    const result = generationRequestSchema.parse(valid)
    expect(result.format).toBe('png')
    expect(result.provider).toBe('codex')
    expect(result.model).toBeUndefined()
  })

  it('accepts all image formats', () => {
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      expect(generationRequestSchema.parse({ ...valid, format }).format).toBe(
        format,
      )
    }
  })

  it('accepts an explicit provider and model', () => {
    const result = generationRequestSchema.parse({
      ...valid,
      provider: 'claude',
      model: 'claude-3.5-sonnet',
    })
    expect(result.provider).toBe('claude')
    expect(result.model).toBe('claude-3.5-sonnet')
  })

  it.each([
    ['empty prompt', { ...valid, prompt: '' }],
    ['prompt too long', { ...valid, prompt: 'x'.repeat(8001) }],
    ['missing width', { prompt: 'x', height: 512 }],
    ['missing height', { prompt: 'x', width: 512 }],
    ['width below 256', { ...valid, width: 128 }],
    ['height below 256', { ...valid, height: 128 }],
    ['width above 4096', { ...valid, width: 8192 }],
    ['height above 4096', { ...valid, height: 8192 }],
    ['non-integer width', { ...valid, width: 512.5 }],
    ['invalid format', { ...valid, format: 'gif' }],
  ])('rejects invalid request (%s)', (_label, body) => {
    expect(() => generationRequestSchema.parse(body)).toThrow()
  })

  it('trims whitespace from prompt', () => {
    const result = generationRequestSchema.parse({
      ...valid,
      prompt: '  hello world  ',
    })
    expect(result.prompt).toBe('hello world')
  })
})

describe('imageFormatSchema', () => {
  it.each(['png', 'jpeg', 'webp'])('accepts %s', (format) => {
    expect(imageFormatSchema.parse(format)).toBe(format)
  })

  it('rejects unsupported formats', () => {
    expect(() => imageFormatSchema.parse('gif')).toThrow()
    expect(() => imageFormatSchema.parse('')).toThrow()
  })
})
