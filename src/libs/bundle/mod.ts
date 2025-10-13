import esbuild, { type BuildContext, type BuildOptions } from "esbuild";
import crypto from "node:crypto";
import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";
import { mkdirAndWriteFile } from "../fs/mod.ts";
import type { Nullable } from "../nullable/mod.ts";

class ContextAndItsInputs {

  constructor(
    readonly context: BuildContext,
    readonly inputs: Set<string>
  ) { }

}

export class Builder {

  readonly inputs = new Set<string>()
  readonly hashes = new Map<string, string>()

  #current: Nullable<ContextAndItsInputs>

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly platform: "browser" | "node",
    readonly mode: "production" | "development",
  ) { }

  add(file: string): string {
    const name = path.basename(file, path.extname(file))

    const outname = name + (/\.(c|m)?(t|j)s(x?)$/.test(file) ? ".js" : path.extname(file))
    const outfile = path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname)

    this.inputs.add(file)

    return outfile
  }

  clear() {
    this.inputs.clear()
    this.hashes.clear()
  }

  async #compute() {
    if (this.#current != null && this.inputs.difference(this.#current.inputs).size === 0)
      return this.#current.context

    const inputs = [...this.inputs]

    const options: BuildOptions = {
      write: false,
      bundle: true,
      format: "esm",
      entryPoints: inputs,
      platform: this.platform,
      outdir: this.exitrootdir,
      outbase: this.entryrootdir,
      external: ["node:*", ...builtinModules],
      minify: this.mode === "production" ? true : false,
      sourcemap: this.mode === "production" ? false : "linked",
      define: { "process.env.PLATFORM": JSON.stringify(this.platform) },
      banner: this.platform === "node" ? { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` } : {}
    } as const

    const current = new ContextAndItsInputs(await esbuild.context(options), new Set(this.inputs))

    this.#current = current

    return current.context
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
      const relative = path.relative(process.cwd(), output.path)

      await mkdirAndWriteFile(output.path, output.text)

      const hash = crypto.createHash("sha256").update(output.contents).digest()

      this.hashes.set(relative, `sha256-${hash.toString("base64")}`)

      continue
    }

    return
  }

}