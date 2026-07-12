import { z } from "zod"

export const imageFormatSchema = z.enum(["png", "jpeg", "webp"])
export type ImageFormat = z.infer<typeof imageFormatSchema>

export const generationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  width: z.number().int().min(256).max(4096),
  height: z.number().int().min(256).max(4096),
  format: imageFormatSchema.default("png"),
  provider: z.string().default("codex"),
  model: z.string().optional(),
})

export type GenerationRequest = z.infer<typeof generationRequestSchema>

export type GeneratedImage = {
  buffer: Buffer
  mimeType: `image/${string}`
  provider: string
  model?: string
}
