# subscription-llm-images

A localhost HTTP service that generates images through subscription-backed LLM
CLIs. The initial provider uses Codex's stable `image_generation` feature and
the account already authenticated in the local Codex CLI.

The service never reads, copies, or exposes Codex credentials. It starts the
installed CLI as a subprocess and returns the generated image bytes.

## Requirements

- Node.js 22+
- pnpm
- Codex CLI authenticated with a plan that includes image generation

Verify Codex before starting:

```bash
codex --version
codex features list | grep image_generation
```

## Setup

```bash
pnpm install
cp .env.example .env # optional; environment variables are read directly
pnpm dev
```

The default address is `http://127.0.0.1:8787`. The service refuses to bind to
a non-loopback address unless `SUBSCRIPTION_IMAGE_TOKEN` is configured.

## API

### Health

```bash
curl http://127.0.0.1:8787/health
```

### Capabilities

```bash
curl http://127.0.0.1:8787/v1/capabilities
```

### Generate

```bash
curl -X POST http://127.0.0.1:8787/v1/images/generate \
  -H 'content-type: application/json' \
  -d '{
    "provider": "codex",
    "model": "gpt-image-2",
    "prompt": "A retro travel poster of Stockholm",
    "width": 1536,
    "height": 1024,
    "format": "webp"
  }' \
  --output stockholm.webp
```

When `SUBSCRIPTION_IMAGE_TOKEN` is configured, include:

```bash
-H "authorization: Bearer $SUBSCRIPTION_IMAGE_TOKEN"
```

Generation uses one isolated temporary workspace per request. The Codex CLI is
run ephemerally with user configuration ignored, except for its existing auth.
The generated result is normalized to the requested dimensions and format with
Sharp, then the temporary workspace is deleted.

## `wc-img-ai/server` integration

```ts
const result = await generateImageBuffer(prompt, width, height, {
  provider: 'custom',
  generate: async ({ prompt, width, height, signal }) => {
    const response = await fetch(
      'http://127.0.0.1:8787/v1/images/generate',
      {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          ...(process.env.SUBSCRIPTION_IMAGE_TOKEN
            ? { authorization: `Bearer ${process.env.SUBSCRIPTION_IMAGE_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          provider: 'codex',
          model: 'gpt-image-2',
          prompt,
          width,
          height,
          format: 'webp',
        }),
      },
    )
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`subscription image provider failed (${response.status}): ${body}`)
    }
    return {
      buffer: new Uint8Array(await response.arrayBuffer()),
      mimeType: (response.headers.get('content-type') ?? 'image/webp') as `image/${string}`,
    }
  },
})
```

## Adding providers

Implement `ImageProvider` from `src/providers/provider.ts`, declare its
capabilities and register it in `src/server.ts`. This keeps CLI subscriptions,
API-key services and local models behind the same HTTP contract.

## Operational notes

- Default concurrency is one generation to avoid exhausting subscription limits.
- Requests time out after three minutes by default.
- Client disconnects abort the Codex subprocess.
- Do not expose this service publicly without authentication and an external
  rate limiter.
- Subscription availability and usage limits are controlled by each provider.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT
