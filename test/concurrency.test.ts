import { describe, expect, it } from 'vitest'
import {
  CapacityError,
  ConcurrencyGate,
} from '../src/concurrency.js'

describe('ConcurrencyGate', () => {
  it('runs operations sequentially under capacity', async () => {
    const gate = new ConcurrencyGate(2)
    const results: number[] = []

    await Promise.all([
      gate.run(async () => {
        results.push(1)
      }),
      gate.run(async () => {
        results.push(2)
      }),
    ])

    expect(results).toHaveLength(2)
    expect(gate.inUse).toBe(0)
  })

  it('rejects work above capacity with CapacityError', async () => {
    const gate = new ConcurrencyGate(1)
    let release: (() => void) | undefined
    const first = gate.run(
      () => new Promise<void>((resolve) => (release = resolve)),
    )

    await expect(gate.run(async () => undefined)).rejects.toBeInstanceOf(
      CapacityError,
    )

    release?.()
    await first
  })

  it('frees capacity after an operation throws', async () => {
    const gate = new ConcurrencyGate(1)

    await expect(
      gate.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(gate.inUse).toBe(0)

    // The slot should be available again
    await gate.run(async () => undefined)
    expect(gate.inUse).toBe(0)
  })

  it('tracks inUse count', async () => {
    const gate = new ConcurrencyGate(3)
    let release1: (() => void) | undefined
    let release2: (() => void) | undefined

    const op1 = gate.run(
      () => new Promise<void>((resolve) => (release1 = resolve)),
    )
    const op2 = gate.run(
      () => new Promise<void>((resolve) => (release2 = resolve)),
    )

    await new Promise((r) => setTimeout(r, 10))
    expect(gate.inUse).toBe(2)

    release1?.()
    await op1
    expect(gate.inUse).toBe(1)

    release2?.()
    await op2
    expect(gate.inUse).toBe(0)
  })
})
