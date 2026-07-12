import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"
import type { Config } from "../src/config.js"
import type { ImageProvider } from "../src/providers/provider.js"

const config: Config = {
  HOST: "127.0.0.1",
  PORT: 8787,
  CODEX_BIN: "codex",
  GENERATION_TIMEOUT_MS: 30_000,
  MAX_CONCURRENT_GENERATIONS: 1,
}

function fakeProvider(): ImageProvider {
  return {
    capabilities: {
      id: "fake",
      authentication: "local",
      formats: ["png"],
      maxWidth: 1024,
      maxHeight: 1024,
    },
    generate: vi.fn(async () => ({
      buffer: Buffer.from("image"),
      mimeType: "image/png" as const,
      provider: "fake",
      model: "test-model",
    })),
  }
}

describe("service", () => {
  it("reports health and capabilities", async () => {
    const app = createApp(config, [fakeProvider()])
    expect((await app.request("/health")).status).toBe(200)
    const capabilities = (await (
      await app.request("/v1/capabilities")
    ).json()) as { providers: Array<{ id: string }> }
    expect(capabilities.providers[0]?.id).toBe("fake")
  })

  it("generates raw image bytes through a selected provider", async () => {
    const provider = fakeProvider()
    const app = createApp(config, [provider])
    const response = await app.request("/v1/images/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "fake",
        prompt: "test",
        width: 512,
        height: 512,
        format: "png",
      }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("x-image-model")).toBe("test-model")
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("image")
    expect(provider.generate).toHaveBeenCalledOnce()
  })

  it("requires a configured bearer token", async () => {
    const app = createApp({ ...config, SUBSCRIPTION_IMAGE_TOKEN: "a-secure-test-token" }, [
      fakeProvider(),
    ])
    const response = await app.request("/v1/images/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    expect(response.status).toBe(401)
  })
})
