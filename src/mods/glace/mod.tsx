import { ancestor } from "@/libs/ancestor/mod.ts";
import { bundle, type Output } from "@/libs/bundle/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { Window, type HTMLScriptElement } from "happy-dom";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export class Bundler {

  readonly inputs = new Array<string>()

  readonly result = Promise.withResolvers<Map<string, Output>>()

  constructor(
    readonly directory: string,
    readonly externals: string[] = [],
  ) { }

  async bundle(file: string) {
    const nonce = crypto.randomUUID().slice(0, 8)

    const input = path.join(tmpdir(), `./${nonce}.js`)

    writeFileSync(input, `export * from "${path.resolve(file)}";`)

    this.inputs.push(input)

    const outputs = await this.result.promise

    const output = outputs.get(nonce)

    if (output == null)
      throw new Error("Output not found")

    return output
  }

  async collect() {
    const outputs = new Map<string, Output>()

    for await (const output of bundle(this.inputs, this.directory)) {
      const nonce = path.basename(output.path, path.extname(output.path))

      const digest = crypto.createHash("sha256").update(output.text).digest("hex").slice(0, 8)
      const repath = path.join(this.directory, `./${digest}.js`)

      writeFileSync(repath, output.text)

      outputs.set(nonce, { path: repath, text: output.text, hash: digest })
    }

    this.result.resolve(outputs)
  }

}

export class Glace {

  readonly bundler: Bundler

  constructor(
    readonly entrypoints: readonly string[],
    readonly exitrootdir: string
  ) {
    this.bundler = new Bundler(this.exitrootdir)
  }

  async bundle() {
    const entryrootdir = ancestor(this.entrypoints)

    mkdirSync(path.join(this.exitrootdir, "./tmp"), { recursive: true })

    const bundle = async (entrypoint: string) => {
      const exitpoint = path.join(this.exitrootdir, path.relative(entryrootdir, entrypoint))

      mkdirSync(path.dirname(exitpoint), { recursive: true })

      const window = new Window({ url: "file://" + path.resolve(entrypoint) });
      const document = new window.DOMParser().parseFromString(readFileSync(entrypoint, "utf8"), "text/html")

      const bundle = async (script: HTMLScriptElement) => {
        if (script.type === "bundle") {
          if (script.src) {
            const url = new URL(script.src)

            if (url.protocol !== "file:")
              throw new Error("Unsupported protocol")

            const output = await this.bundler.bundle(url.pathname)
            const target = path.relative(path.dirname(exitpoint), output.path)

            script.type = "module"
            script.src = redot(target)

            // const { App } = await import(render)

            // if (App == null)
            //   return

            // document.body.innerHTML = await prerenderToString(React.createElement(App))
          } else {
            // TODO
          }
        }

        if (script.type === "nobundle") {
          // if (script.src) {

          // } else {
          //   // TODO
          // }
        }
      }

      const promises = new Array<Promise<void>>()

      for (const script of document.scripts)
        promises.push(bundle(script))

      await Promise.all(promises)

      writeFileSync(exitpoint, document.documentElement.outerHTML)
    }

    const promises = new Array<Promise<void>>()

    for (const entrypoint of this.entrypoints)
      promises.push(bundle(entrypoint))

    await this.bundler.collect()

    await Promise.all(promises)

    rmSync(path.join(this.exitrootdir, "./tmp"), { recursive: true, force: true })
  }

}