import { ancestor } from "@/libs/ancestor/mod.ts";
import { bundle } from "@/libs/bundle/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLScriptElement } from "happy-dom";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setImmediate } from "node:timers/promises";

const global = new Mutex(globalThis)

export class Bundler {

  readonly inputs = new Array<string>()

  readonly result = Promise.withResolvers<Map<string, string>>()

  constructor(
    readonly exitrootdir: string,
    readonly development: boolean
  ) { }

  async include(input: string) {
    const name = path.basename(input, path.extname(input))

    this.inputs.push(input)

    const result = await this.result.promise

    const output = result.get(name)

    if (output == null)
      throw new Error("Output not found")

    return output
  }

  async collect() {
    const renames = new Map<string, string>()
    const repaths = new Map<string, string>()

    for await (const output of bundle(this.inputs, this.exitrootdir, this.development)) {
      mkdirSync(path.dirname(output.path), { recursive: true })

      const name = path.basename(output.path, path.extname(output.path))

      const rename = crypto.createHash("sha256").update(output.text).digest("hex").slice(0, 8)
      const repath = path.join(path.dirname(output.path), `./${rename}.js`)

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
        const bundle = script.dataset.bundle

        delete script.dataset.bundle

        if (bundle != null) {
          const modes = bundle.split(",").map(s => s.trim().toLowerCase())

          if (script.src) {
            const url = new URL(script.src)

            if (url.protocol !== "file:")
              throw new Error("Unsupported protocol")

            using stack = new DisposableStack()

            const nonce = crypto.randomUUID().slice(0, 8)
            const input = path.join(path.dirname(entrypoint), `./${nonce}.js`)

            writeFileSync(input, `export * from "${path.resolve(url.pathname)}";`)

            stack.defer(() => rmSync(input, { force: true }))

            if (modes.includes("client")) {
              script.src = redot(path.relative(path.dirname(exitpoint), await this.client.include(input)))
            } else {
              script.remove()
            }

            if (modes.includes("static")) {
              const output = await this.server.include(input)

              using _ = await global.lockOrWait()

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              globalThis.window = window

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              globalThis.document = document

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              globalThis.location = window.location

              await import(path.resolve(output))

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              delete globalThis.window

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              delete globalThis.document

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              delete globalThis.location
            }

            return
          } else {
            using stack = new DisposableStack()

            const nonce = crypto.randomUUID().slice(0, 8)
            const input = path.join(path.dirname(entrypoint), `./${nonce}.js`)

            writeFileSync(input, script.textContent)

            stack.defer(() => rmSync(input, { force: true }))

            if (modes.includes("client")) {
              const output = await this.client.include(input)

              stack.defer(() => rmSync(output, { force: true }))

              script.textContent = readFileSync(output, "utf8").trim()
            } else {
              script.remove()
            }

            if (modes.includes("static")) {
              const server = await this.server.include(input)

              using _ = await global.lockOrWait()

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              globalThis.window = window

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              globalThis.document = document

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              globalThis.location = window.location

              await import(path.resolve(server))

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              delete globalThis.window

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              delete globalThis.document

              // deno-lint-ignore ban-ts-comment
              // @ts-ignore
              delete globalThis.location
            }

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

    // rmSync(this.exittempdir, { recursive: true, force: true })
  }

}