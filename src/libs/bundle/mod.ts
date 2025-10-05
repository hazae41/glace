import esbuild from "esbuild";
import { builtinModules } from "node:module";

export interface Output {
  readonly path: string
  readonly text: string
  readonly hash: string
}

export async function* bundle(inputs: string[], target: string, development: boolean, browserside: boolean): AsyncGenerator<Output> {
  if ("Deno" in globalThis) {
    const result = await Deno.bundle({
      write: false,
      format: "esm",
      codeSplitting: true,
      entrypoints: inputs,
      outputDir: target,
      minify: development ? false : true,
      platform: browserside ? "browser" : "deno",
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
      yield { path: file.path, text: file.text(), hash: file.hash }

    return
  } else {
    const result = await esbuild.build({
      write: false,
      bundle: true,
      format: "esm",
      splitting: true,
      entryPoints: inputs,
      outdir: target,
      minify: development ? false : true,
      platform: browserside ? "browser" : "node",
      banner: browserside ? {} : { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` },
      external: ["node:*", ...builtinModules],
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
}