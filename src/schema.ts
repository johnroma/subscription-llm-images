import { z } from "zod"

export const imageFormatSchema = z.enum(["png", "jpeg", "webp"])
export type ImageFormat = z.infer<typeof imageFormatSchema>

const referenceMimeTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"])
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const maxReferenceImageBytes = 10 * 1024 * 1024

export const referenceImageSchema = z.object({
  data: z
    .string()
    .min(1)
    .max(Math.ceil((maxReferenceImageBytes * 4) / 3))
    .regex(base64Pattern, "must be valid base64")
    .refine(
      (data) => Buffer.byteLength(data, "base64") <= maxReferenceImageBytes,
      `must be ${maxReferenceImageBytes / 1024 / 1024} MB or smaller`,
    ),
  mimeType: referenceMimeTypeSchema,
})
export type ReferenceImage = z.infer<typeof referenceImageSchema>

export const generationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  width: z.number().int().min(256).max(4096),
  height: z.number().int().min(256).max(4096),
  format: imageFormatSchema.default("png"),
  provider: z.string().default("codex"),
  model: z.string().optional(),
  references: z.array(referenceImageSchema).max(2).default([]),
})

export type GenerationRequest = z.infer<typeof generationRequestSchema>

export type GeneratedImage = {
  buffer: Buffer
  mimeType: `image/${string}`
  provider: string
  model?: string
}
