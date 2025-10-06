import { ancestor } from "@/libs/ancestor/mod.ts";
import esbuild, { type BuildContext, type BuildOptions } from "esbuild";
import { builtinModules } from "node:module";
import path from "node:path";
import type { Nullable } from "../nullable/mod.ts";

export class Bundler {

  readonly #inputs = new Set<string>()

  #context: Nullable<BuildContext>

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

    this.#context = null

    return outfile
  }

  delete(file: string) {
    const name = path.basename(file, path.extname(file))

    const outname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)) ? ".js" : path.extname(file))
    const outfile = path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname)

    this.#inputs.delete(file)

    this.#context = null

    return outfile
  }

  async #make() {
    if (this.#context != null)
      return this.#context

    const inputs = [...this.#inputs]

    const options: BuildOptions = {
      write: true,
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

    const context = await esbuild.context(options)

    this.#context = context

    return context
  }

  async build() {
    const context = await this.#make()

    const result = await context.rebuild()

    for (const warning of result.warnings)
      console.warn(warning)

    for (const error of result.errors)
      console.error(error)

    if (result.errors.length)
      throw new Error("Build failed")

    return
  }

}