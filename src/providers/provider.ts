import type { GeneratedImage, GenerationRequest } from "../schema.js"

export type ProviderCapabilities = {
  id: string
  authentication: "subscription" | "api-key" | "local"
  formats: readonly string[]
  maxWidth: number
  maxHeight: number
}

export interface ImageProvider {
  readonly capabilities: ProviderCapabilities
  generate(request: GenerationRequest, signal: AbortSignal): Promise<GeneratedImage>
}
