import esbuild from "esbuild";

export interface Output {
  readonly path: string
  readonly text: string
  readonly hash: string
}

export async function prebundle(input: string, output: string, external: string[] = []) {
  if ("Deno" in globalThis) {
    const result = await Deno.bundle({
      entrypoints: [input],
      format: "esm",
      outputPath: output,
      external
    })

    for (const warning of result.warnings)
      console.warn(warning)

    for (const error of result.errors)
      console.error(error)

    if (result.errors.length)
      throw new Error("Build failed")

    return
  } else {
    const result = await esbuild.build({
      entryPoints: [input],
      bundle: true,
      format: "esm",
      outfile: output,
      external,
    })

    for (const warning of result.warnings)
      console.warn(warning)

    for (const error of result.errors)
      console.error(error)

    if (result.errors.length)
      throw new Error("Build failed")

    return
  }
}

export async function* bundle(inputs: string[], target: string, development: boolean): AsyncGenerator<Output> {
  if ("Deno" in globalThis) {
    const result = await Deno.bundle({
      entrypoints: inputs,
      format: "esm",
      outputDir: target,
      codeSplitting: true,
      minify: !development,
      write: false,
    })

    for (const warning of result.warnings)
      console.warn(warning)

    for (const error of result.errors)
      console.error(error)

    if (result.errors.length)
      throw new Error("Build failed")

    if (result.outputFiles == null)
      throw new Error("No output files")

    console.log(inputs.length, result.outputFiles.length)

    for (const file of result.outputFiles)
      yield { path: file.path, text: file.text(), hash: file.hash }

    return
  } else {
    const result = await esbuild.build({
      entryPoints: inputs,
      bundle: true,
      format: "esm",
      outdir: target,
      splitting: true,
      write: false,
      minify: !development,
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