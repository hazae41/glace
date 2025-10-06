import { ancestor } from "@/libs/ancestor/mod.ts";
import esbuild, { type BuildContext, type BuildOptions } from "esbuild";
import { builtinModules } from "node:module";
import path from "node:path";
import { mkdirAndWriteFile } from "../fs/mod.ts";
import type { Nullable } from "../nullable/mod.ts";

class ContextAndItsInputs {

  constructor(
    readonly context: BuildContext,
    readonly inputs: Set<string>
  ) { }

}

export class Builder {

  readonly #inputs = new Set<string>()

  #current: Nullable<ContextAndItsInputs>

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly platform: "browser" | "node",
    readonly mode: "production" | "development",
  ) { }

  add(file: string) {
    const name = path.basename(file, path.extname(file))

    const outname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)) ? ".js" : path.extname(file))
    const outfile = path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname)

    this.#inputs.add(file)

    return outfile
  }

  clear() {
    this.#inputs.clear()
  }

  async #compute() {
    if (this.#current != null && this.#inputs.difference(this.#current.inputs).size === 0)
      return this.#current.context

    const inputs = [...this.#inputs]

    const options: BuildOptions = {
      write: false,
      bundle: true,
      format: "esm",
      splitting: true,
      entryPoints: inputs,
      platform: this.platform,
      external: ["node:*", ...builtinModules],
      minify: this.mode === "production" ? true : false,
      sourcemap: this.mode === "production" ? false : "linked",
      define: { "process.env.PLATFORM": JSON.stringify(this.platform) },
      outdir: inputs.length ? path.join(this.exitrootdir, path.relative(this.entryrootdir, ancestor(inputs))) : this.exitrootdir,
      banner: this.platform === "node" ? { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` } : {}
    } as const

    const current = new ContextAndItsInputs(await esbuild.context(options), new Set(this.#inputs))

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

    for (const output of result.outputFiles)
      await mkdirAndWriteFile(output.path, output.text)

    return
  }

}