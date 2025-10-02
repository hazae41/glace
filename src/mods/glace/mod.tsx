import { ancestor } from "@/libs/ancestor/mod.ts";
import { bundle } from "@/libs/bundle/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { Window, type HTMLScriptElement } from "happy-dom";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";

export class Bundler {

  readonly inputs = new Array<string>()

  readonly result = Promise.withResolvers<Map<string, string>>()

  constructor(
    readonly exitrootdir: string,
    readonly development: boolean
  ) { }

  async include(file: string) {
    const nonce = crypto.randomUUID().slice(0, 8)

    const input = path.join(tmpdir(), `./${nonce}.js`)

    writeFileSync(input, `export * from "${path.resolve(file)}";`)

    this.inputs.push(input)

    const result = await this.result.promise

    const output = result.get(nonce)

    if (output == null)
      throw new Error("Output not found")

    return output
  }

  async collect() {
    const renames = new Map<string, string>()
    const repaths = new Map<string, string>()

    for await (const output of bundle(this.inputs, this.exitrootdir, this.development)) {
      const name = path.basename(output.path, path.extname(output.path))

      const rename = crypto.createHash("sha256").update(output.text).digest("hex").slice(0, 8)
      const repath = path.join(this.exitrootdir, `./${rename}.js`)

      writeFileSync(repath, output.text)

      renames.set(name, rename)
      repaths.set(name, repath)
    }

    for (const repath of repaths.values()) {
      let text = readFileSync(repath, "utf8")

      for (const [name, rename] of renames.entries())
        text = text.replaceAll(name, rename)

      writeFileSync(repath, text)
    }

    this.result.resolve(repaths)
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

            const client = await this.client.include(url.pathname)
            const server = await this.server.include(url.pathname)

            script.type = "module"
            script.src = redot(path.relative(path.dirname(exitpoint), client))

            script.textContent = ""

            // deno-lint-ignore no-explicit-any
            globalThis.window = window as any

            // deno-lint-ignore no-explicit-any
            globalThis.document = document as any

            // deno-lint-ignore no-explicit-any
            globalThis.location = window.location as any

            await import(path.resolve(server))

            return
          } else {
            using stack = new DisposableStack()

            const file = path.join(path.dirname(entrypoint), `./${crypto.randomUUID().slice(0, 8)}.js`)

            writeFileSync(file, script.textContent)

            stack.defer(() => rmSync(file, { force: true }))

            const client = await this.client.include(file)
            const server = await this.server.include(file)

            script.type = "module"
            script.src = redot(path.relative(path.dirname(exitpoint), client))

            script.textContent = ""

            const { html } = await import(path.resolve(server))

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

    // TODO: wait for Deno.bundle to be fixed
    await new Promise(ok => setImmediate(ok))

    await this.server.collect()

    await Promise.all(promises)

    rmSync(this.exittempdir, { recursive: true, force: true })
  }

}