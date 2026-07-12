import { describe, expect, it } from "vitest"
import { CapacityError, ConcurrencyGate } from "../src/concurrency.js"

describe("ConcurrencyGate", () => {
  it("rejects work above capacity", async () => {
    const gate = new ConcurrencyGate(1)
    let release: (() => void) | undefined
    const first = gate.run(() => new Promise<void>((resolve) => (release = resolve)))
    await expect(gate.run(async () => undefined)).rejects.toBeInstanceOf(CapacityError)
    release?.()
    await first
    expect(gate.inUse).toBe(0)
  })
})
