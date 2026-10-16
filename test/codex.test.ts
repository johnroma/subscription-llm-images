import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { CodexProvider } from '../src/providers/codex.js'

it('logs the CLI explanation for a successful exit without an image, without exposing it publicly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-test-'))
  const executable = join(directory, 'codex')
  const diagnostic = 'Provider explanation: no image was produced for this request.'
  await writeFile(executable, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(diagnostic)})\n`)
  await chmod(executable, 0o700)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const config = loadConfig({ CODEX_BIN: executable })
    const app = createApp(config, [new CodexProvider(config)])
    const response = await app.request('/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'codex', prompt: 'test', width: 512, height: 512, format: 'png' }),
    })
    expect(response.status).toBe(502)
    const body = await response.text()
    expect(body).toContain('Codex completed without creating ./images/generated.png')
    expect(body).not.toContain(diagnostic)
    expect(log.mock.calls.flat().join(' ')).toContain(diagnostic)
  } finally {
    log.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})
