import { serve } from "@hono/node-server"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { CodexProvider } from "./providers/codex.js"

const config = loadConfig()
const app = createApp(config, [new CodexProvider(config)])

serve(
  {
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
  },
  (info) => {
    console.log(`subscription-llm-images listening on http://${info.address}:${info.port}`)
  },
)
