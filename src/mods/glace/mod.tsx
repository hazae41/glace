import { bundle } from "@/libs/bundle/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { HTMLLinkElement, HTMLStyleElement, Window, type HTMLScriptElement } from "happy-dom";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { redot } from "../../libs/redot/mod.ts";
import { walkSync } from "../../libs/walk/mod.ts";

const mutex = new Mutex(undefined)

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
      const repath = path.join(path.dirname(output.path), `./${rename}` + path.extname(output.path))

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

  readonly client: Bundler
  readonly server: Bundler

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly development: boolean
  ) {
    this.client = new Bundler(this.exitrootdir, this.development)
    this.server = new Bundler(tmpdir(), true)

    return
  }

  async bundle() {
    const ignored = new Set<string>()

    const bundleAsHtml = async (entrypoint: string) => {
      const exitpoint = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      mkdirSync(path.dirname(exitpoint), { recursive: true })

      writeFileSync(exitpoint, readFileSync(entrypoint))

      const window = new Window({ url: "file://" + path.resolve(entrypoint) });
      const document = new window.DOMParser().parseFromString(readFileSync(entrypoint, "utf8"), "text/html")

      const bundleAsScript = async (script: HTMLScriptElement) => {
        const modes = script.dataset.bundle.split(",").map(s => s.trim().toLowerCase())

        delete script.dataset.bundle

        if (script.src) {
          const url = new URL(script.src)

          if (url.protocol !== "file:")
            throw new Error("Unsupported protocol")

          ignored.add(url.pathname)

          const nonce = crypto.randomUUID().slice(0, 8)
          const input = path.join(tmpdir(), path.relative(this.entryrootdir, path.dirname(entrypoint)), `./${nonce}.js`)

          mkdirSync(path.dirname(input), { recursive: true })

          writeFileSync(input, `export * from "${path.resolve(url.pathname)}";`)

          if (modes.includes("client")) {
            script.src = redot(path.relative(path.dirname(exitpoint), await this.client.include(input)))
          } else {
            script.remove()
          }

          if (modes.includes("static")) {
            const output = await this.server.include(input)

            using _ = await mutex.lockOrWait()

            window.location.href = `file://${path.resolve(exitpoint)}`

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
          const nonce = crypto.randomUUID().slice(0, 8)
          const input = path.join(tmpdir(), path.relative(this.entryrootdir, path.dirname(entrypoint)), `./${nonce}.js`)

          mkdirSync(path.dirname(input), { recursive: true })

          writeFileSync(input, script.textContent)

          if (modes.includes("client")) {
            const output = await this.client.include(input)

            script.textContent = `\n    ${readFileSync(output, "utf8").trim()}\n  `

            rmSync(output, { force: true })
          } else {
            script.remove()
          }

          if (modes.includes("static")) {
            const output = await this.server.include(input)

            using _ = await mutex.lockOrWait()

            window.location.href = `file://${path.resolve(exitpoint)}`

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.window = window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.document = window

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
        }
      }

      const bundleAsStylesheetLink = async (link: HTMLLinkElement) => {
        const modes = link.dataset.bundle.split(",").map(s => s.trim().toLowerCase())

        delete link.dataset.bundle

        if (!modes.includes("client"))
          return

        const url = new URL(link.href)

        ignored.add(url.pathname)

        const nonce = crypto.randomUUID().slice(0, 8)
        const input = path.join(tmpdir(), path.relative(this.entryrootdir, path.dirname(entrypoint)), `./${nonce}.css`)

        mkdirSync(path.dirname(input), { recursive: true })

        writeFileSync(input, `@import "${path.resolve(url.pathname)}";`)

        link.href = redot(path.relative(path.dirname(exitpoint), await this.client.include(input)))
      }

      const bundleAsStyle = async (style: HTMLStyleElement) => {

      }

      const promises = new Array<Promise<void>>()

      for (const script of document.querySelectorAll("script[data-bundle]"))
        promises.push(bundleAsScript(script as unknown as HTMLScriptElement))
      for (const style of document.querySelectorAll("style[data-bundle]"))
        promises.push(bundleAsStyle(style as unknown as HTMLStyleElement))
      for (const link of document.querySelectorAll("link[rel=stylesheet][data-bundle]"))
        promises.push(bundleAsStylesheetLink(link as unknown as HTMLLinkElement))

      await Promise.all(promises)

      writeFileSync(exitpoint, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`)
    }

    const promises = new Array<Promise<void>>()

    for (const entrypoint of walkSync(this.entryrootdir)) {
      if (!entrypoint.endsWith(".html"))
        continue
      promises.push(bundleAsHtml(entrypoint))
    }

    for (const entrypoint of walkSync(this.entryrootdir)) {
      if (ignored.has(path.resolve(entrypoint)))
        continue

      const exitpoint = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      mkdirSync(path.dirname(exitpoint), { recursive: true })

      writeFileSync(exitpoint, readFileSync(entrypoint))
    }

    await this.client.collect()

    // TODO: wait for Deno.bundle to be fixed
    await new Promise(ok => setImmediate(ok))

    await this.server.collect()

    await Promise.all(promises)

    return
  }

}