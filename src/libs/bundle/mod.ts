import { ancestor } from "@/libs/ancestor/mod.ts";
import { mkdirAndWriteFile } from "@/libs/fs/mod.ts";
import esbuild from "esbuild";
import { builtinModules } from "node:module";
import path from "node:path";

export interface Output {
  readonly path: string
  readonly text: string
  readonly hash: string
}

export async function* bundle(inputs: string[], target: string, platform: "browser" | "node", mode: "production" | "development"): AsyncGenerator<Output> {
  const result = await esbuild.build({
    write: false,
    bundle: true,
    format: "esm",
    splitting: true,
    entryPoints: inputs,
    outdir: target,
    platform: platform,
    minify: mode === "production" ? true : false,
    sourcemap: mode === "production" ? false : "linked",
    banner: platform === "node" ? { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` } : {},
    define: { "process.env.PLATFORM": JSON.stringify(platform) },
    external: ["node:*", ...builtinModules]
  })

  for (const warning of result.warnings)
    console.warn(warning)

  for (const error of result.errors)
    console.error(error)

  if (result.errors.length)
    throw new Error("Build failed")

  if (result.outputFiles == null)
    throw new Error("No output files")

  for (const file of result.outputFiles)
    yield { path: file.path, text: file.text, hash: file.hash }

  return
}

export class Bundler {

  readonly inputs = new Set<string>()

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly platform: "browser" | "node",
    readonly mode: "production" | "development",
  ) { }

  include(file: string) {
    const name = path.basename(file, path.extname(file))

    const outname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)) ? ".js" : path.extname(file))
    const outfile = path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname)

    this.inputs.add(file)

    return outfile
  }

  async bundle() {
    if (this.inputs.size === 0)
      return

    const inputs = [...this.inputs]
    const outdir = path.join(this.exitrootdir, path.relative(this.entryrootdir, ancestor(inputs)))

    for await (const output of bundle(inputs, outdir, this.platform, this.mode))
      await mkdirAndWriteFile(output.path, output.text)

    return
  }

}