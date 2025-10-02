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
    readonly exitrootdir: string,
    readonly development: boolean
  ) { }

  async file(file: string) {
    const nonce = crypto.randomUUID().slice(0, 8)

    const input = path.join(tmpdir(), `./${nonce}.module.js`)

    writeFileSync(input, `export * from "${path.resolve(file)}";`)

    this.inputs.push(input)

    const outputs = await this.result.promise

    const output = outputs.get(nonce)

    if (output == null)
      throw new Error("Output not found")

    return output
  }

  async text(text: string) {
    const nonce = crypto.randomUUID().slice(0, 8)

    const input = path.join(tmpdir(), `./${nonce}.module.js`)

    writeFileSync(input, text)

    this.inputs.push(input)

    const outputs = await this.result.promise

    const output = outputs.get(nonce)

    if (output == null)
      throw new Error("Output not found")

    return output
  }

  async collect() {
    const outputs = new Map<string, Output>()

    for await (const output of bundle(this.inputs, this.exitrootdir, this.development)) {
      const name = path.basename(output.path, path.extname(output.path))

      if (!name.endsWith(".module")) {
        writeFileSync(output.path, output.text)
        continue
      }

      const nonce = path.basename(name, ".module")

      const digest = crypto.createHash("sha256").update(output.text).digest("hex").slice(0, 8)
      const repath = path.join(this.exitrootdir, `./${digest}.js`)

      writeFileSync(repath, output.text)

      outputs.set(nonce, { path: repath, text: output.text, hash: digest })
    }

    this.result.resolve(outputs)
  }

}

export class Glace {

  readonly exittempdir: string

  readonly client: Bundler
  readonly server: Bundler

  constructor(
    readonly entrypoints: readonly string[],
    readonly exitrootdir: string,
    readonly development: boolean
  ) {
    this.exittempdir = path.join(this.exitrootdir, "./tmp")

    this.client = new Bundler(this.exitrootdir, this.development)
    this.server = new Bundler(this.exittempdir, true)

    return
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
        if (script.dataset.bundle != null) {
          delete script.dataset.bundle

          if (script.src) {
            const url = new URL(script.src)

            if (url.protocol !== "file:")
              throw new Error("Unsupported protocol")

            const client = await this.client.file(url.pathname)
            const server = await this.server.file(url.pathname)

            script.type = "module"
            script.src = redot(path.relative(path.dirname(exitpoint), client.path))

            script.textContent = ""

            // deno-lint-ignore no-explicit-any
            globalThis.document = document as any

            await import(path.resolve(server.path))

            return
          } else {
            const client = await this.client.text(script.textContent)
            const server = await this.server.text(script.textContent)

            script.type = "module"
            script.src = redot(path.relative(path.dirname(exitpoint), client.path))

            script.textContent = ""

            const { html } = await import(path.resolve(server.path))

            if (html == null)
              return

            document.body.innerHTML = html

            return
          }
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

    await this.client.collect()
    await new Promise(ok => setTimeout(ok, 100)) // TODO: find a better solution
    await this.server.collect()

    await Promise.all(promises)

    rmSync(this.exittempdir, { recursive: true, force: true })
  }

}