import { timingSafeEqual } from "node:crypto"
import { Hono } from "hono"
import type { Config } from "./config.js"
import { CapacityError, ConcurrencyGate } from "./concurrency.js"
import { generationRequestSchema } from "./schema.js"
import type { ImageProvider } from "./providers/provider.js"

function authorized(header: string | undefined, token: string | undefined): boolean {
  if (!token) return true
  if (!header?.startsWith("Bearer ")) return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(token)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function createApp(config: Config, providers: readonly ImageProvider[]) {
  const app = new Hono()
  const gate = new ConcurrencyGate(config.MAX_CONCURRENT_GENERATIONS)
  const registry = new Map(providers.map((provider) => [provider.capabilities.id, provider]))

  app.get("/health", (context) =>
    context.json({ status: "ok", activeGenerations: gate.inUse }),
  )

  app.get("/v1/capabilities", (context) =>
    context.json({ providers: providers.map((provider) => provider.capabilities) }),
  )

  app.post("/v1/images/generate", async (context) => {
    if (!authorized(context.req.header("authorization"), config.SUBSCRIPTION_IMAGE_TOKEN)) {
      return context.json({ error: { message: "unauthorized" } }, 401)
    }

    let payload: unknown
    try {
      payload = await context.req.json()
    } catch {
      return context.json({ error: { message: "invalid JSON" } }, 400)
    }
    const parsed = generationRequestSchema.safeParse(payload)
    if (!parsed.success) {
      return context.json(
        { error: { message: "invalid generation request", issues: parsed.error.issues } },
        400,
      )
    }

    const provider = registry.get(parsed.data.provider)
    if (!provider) {
      return context.json(
        {
          error: {
            message: `unknown provider: ${parsed.data.provider}`,
            providers: [...registry.keys()],
          },
        },
        400,
      )
    }

    try {
      const signal = AbortSignal.any([
        context.req.raw.signal,
        AbortSignal.timeout(config.GENERATION_TIMEOUT_MS),
      ])
      const image = await gate.run(() => provider.generate(parsed.data, signal))
      context.header("content-type", image.mimeType)
      context.header("x-image-provider", image.provider)
      if (image.model) context.header("x-image-model", image.model)
      context.header("cache-control", "no-store")
      return context.body(new Uint8Array(image.buffer))
    } catch (error) {
      const status = error instanceof CapacityError ? 429 : 502
      const message = error instanceof Error ? error.message : "generation failed"
      console.error("[generation]", message)
      return context.json({ error: { message } }, status)
    }
  })

  app.notFound((context) => context.json({ error: { message: "not found" } }, 404))
  return app
}
