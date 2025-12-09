import esbuild, { type BuildContext, type BuildOptions, type OutputFile } from "esbuild";
import crypto from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import type { Nullable } from "../nullable/mod.ts";

export class Builder {

  readonly inputs: Set<string> = new Set()

  readonly outputs: Map<string, OutputFile> = new Map()

  #inputs = new Set<string>()
  #context: Nullable<BuildContext>

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly platform: "browser" | "node",
    readonly mode: "production" | "development",
  ) { }

  add(file: string): string {
    const name = path.basename(file, path.extname(file))

    const outname = name + (/\.(c|m)?(t|j)s(x?)$/.test(file) ? ".js" : path.extname(file))
    const outfile = path.resolve(path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname))

    this.inputs.add(file)

    return outfile
  }

  delete(file: string) {
    this.inputs.delete(file)
  }

  async clear() {
    this.outputs.clear()

    await rm(this.exitrootdir, { recursive: true, force: true })

    await mkdir(this.exitrootdir, { recursive: true })
  }

  async #compute() {
    if (this.inputs.difference(this.#inputs).size === 0 && this.#context != null)
      return this.#context

    this.#inputs = new Set(this.inputs)

    const inputs = [...this.inputs.keys()]

    const options: BuildOptions = {
      write: false,
      bundle: true,
      format: "esm",
      minify: false,
      entryPoints: inputs,
      platform: this.platform,
      outdir: this.exitrootdir,
      outbase: this.entryrootdir,
      external: ["node:*", ...builtinModules],
      sourcemap: this.mode === "production" ? false : "linked",
      define: { "process.env.PLATFORM": JSON.stringify(this.platform) },
      banner: this.platform === "node" ? { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` } : {}
    } as const

    const current = await esbuild.context(options)

    this.#context = current

    return current
  }

  async build() {
    const context = await this.#compute()

    const result = await context.rebuild()

    for (const warning of result.warnings)
      console.warn(warning)

    for (const error of result.errors)
      console.error(error)

    if (result.errors.length)
      throw new Error("Build failed")

    if (result.outputFiles == null)
      throw new Error("No output files")

    for (const output of result.outputFiles) {
      const hash = crypto.createHash("sha256").update(output.contents).digest()

      output.hash = `sha256-${hash.toString("base64")}`

      this.outputs.set(output.path, output)

      continue
    }

    return
  }

}