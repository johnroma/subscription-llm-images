import { z } from "zod"

const schema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  SUBSCRIPTION_IMAGE_TOKEN: z.string().min(16).optional(),
  CODEX_BIN: z.string().default("codex"),
  GENERATION_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  MAX_CONCURRENT_GENERATIONS: z.coerce.number().int().min(1).max(8).default(1),
})

export type Config = z.infer<typeof schema>

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(environment)
  if (config.HOST !== "127.0.0.1" && config.HOST !== "::1" && !config.SUBSCRIPTION_IMAGE_TOKEN) {
    throw new Error("SUBSCRIPTION_IMAGE_TOKEN is required when HOST is not loopback")
  }
  return config
}
