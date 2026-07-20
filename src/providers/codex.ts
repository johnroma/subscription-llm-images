import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Config } from "../config.js"
import type { GeneratedImage, GenerationRequest, ReferenceImage } from "../schema.js"
import type { ImageProvider } from "./provider.js"

const MAX_LOG_BYTES = 2 * 1024 * 1024

export class CodexGenerationError extends Error {
  constructor(message: string, readonly details?: string) {
    super(message)
    this.name = "CodexGenerationError"
  }
}

function stopProcess(pid: number | undefined): void {
  if (!pid) return
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Process already exited.
    }
  }
}

const referenceExtension: Record<ReferenceImage["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

async function writeReferences(
  jobDirectory: string,
  references: readonly ReferenceImage[],
): Promise<string[]> {
  if (references.length === 0) return []
  const referencesDirectory = join(jobDirectory, "references")
  await mkdir(referencesDirectory)
  return Promise.all(
    references.map(async (reference, index) => {
      const filename = `reference-${index + 1}.${referenceExtension[reference.mimeType]}`
      await writeFile(join(referencesDirectory, filename), Buffer.from(reference.data, "base64"))
      return join(referencesDirectory, filename)
    }),
  )
}

async function runCodex(
	  executable: string,
  workingDirectory: string,
  prompt: string,
  referencePaths: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--enable",
    "image_generation",
    "-C",
    workingDirectory,
    "-s",
    "workspace-write",
    "--skip-git-repo-check",
    "--json",
    ...referencePaths.flatMap((path) => ["--image", path]),
    prompt,
  ]

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workingDirectory,
      detached: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    const append = (chunk: Buffer) => {
      if (output.length < MAX_LOG_BYTES) output += chunk.toString("utf8")
    }
    child.stdout.on("data", append)
    child.stderr.on("data", append)

    const abort = () => {
      stopProcess(child.pid)
      reject(signal.reason ?? new Error("Codex generation aborted"))
    }
    signal.addEventListener("abort", abort, { once: true })

    child.once("error", (error) => {
      signal.removeEventListener("abort", abort)
      reject(new CodexGenerationError(`Could not start Codex: ${error.message}`))
    })
    child.once("close", (code, terminationSignal) => {
      signal.removeEventListener("abort", abort)
      if (signal.aborted) return
      if (code === 0) resolve()
      else {
        reject(
          new CodexGenerationError(
            `Codex exited with ${terminationSignal ?? `code ${String(code)}`}`,
            output.slice(-8_000),
          ),
        )
      }
    })
  })
}

export class CodexProvider implements ImageProvider {
  readonly capabilities = {
    id: "codex",
    authentication: "subscription" as const,
    formats: ["png", "jpeg", "webp"] as const,
    maxWidth: 4096,
    maxHeight: 4096,
  }

  constructor(private readonly config: Config) {}

  async generate(request: GenerationRequest, signal: AbortSignal): Promise<GeneratedImage> {
    if (request.model && request.model !== "gpt-image-2") {
      throw new CodexGenerationError(
        `Codex provider does not support requested model: ${request.model}`,
      )
    }

    const jobDirectory = await mkdtemp(join(tmpdir(), "subscription-llm-image-"))
    const imagesDirectory = join(jobDirectory, "images")
    const sourcePath = join(imagesDirectory, "generated.png")
    await mkdir(imagesDirectory)
    const referencePaths = await writeReferences(jobDirectory, request.references)

    const ratio = `${request.width}:${request.height}`
    const prompt = [
      "$imagegen Use the built-in gpt-image-2 image generation tool.",
      `Generate this image: ${request.prompt}`,
      referencePaths.length > 0
        ? "Use the attached visual references as ordered inputs."
        : "",
      `Target aspect ratio ${ratio}.`,
      "Save the generated image directly as ./images/generated.png.",
      "Do not create the image with scripts, SVG, canvas, or drawing utilities.",
      "Do not modify or post-process the generated image after the image tool returns it.",
    ].join(" ")

    try {
      await runCodex(this.config.CODEX_BIN, jobDirectory, prompt, referencePaths, signal)
      const source = await readFile(sourcePath).catch(() => {
        throw new CodexGenerationError(
          "Codex completed without creating ./images/generated.png",
        )
      })
      const pipeline = sharp(source).resize(request.width, request.height, {
        fit: "cover",
        position: "centre",
      })
      const buffer =
        request.format === "jpeg"
          ? await pipeline.jpeg({ quality: 90 }).toBuffer()
          : request.format === "webp"
            ? await pipeline.webp({ quality: 90 }).toBuffer()
            : await pipeline.png().toBuffer()
      return {
        buffer,
        mimeType: `image/${request.format}`,
        provider: this.capabilities.id,
        model: "gpt-image-2",
      }
    } finally {
      await rm(jobDirectory, { recursive: true, force: true })
    }
  }
}
