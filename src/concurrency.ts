export class CapacityError extends Error {
  constructor() {
    super("generation capacity is currently full")
    this.name = "CapacityError"
  }
}

export class ConcurrencyGate {
  private active = 0

  constructor(private readonly maximum: number) {}

  get inUse(): number {
    return this.active
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) throw new CapacityError()
    this.active += 1
    try {
      return await operation()
    } finally {
      this.active -= 1
    }
  }
}
