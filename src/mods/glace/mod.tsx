import { bundle } from "@/libs/bundle/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { HTMLLinkElement, HTMLStyleElement, Window, type HTMLScriptElement } from "happy-dom";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    this.server = new Bundler(this.exitrootdir, true)

    return
  }

  async bundle() {
    const bundleAsHtml = async (entrypoint: string) => {
      const exitpoint = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      mkdirSync(path.dirname(exitpoint), { recursive: true })

      writeFileSync(exitpoint, readFileSync(entrypoint))

      const entrywindow = new Window({ url: "file://" + path.resolve(entrypoint) });
      const entrydocument = new entrywindow.DOMParser().parseFromString(readFileSync(entrypoint, "utf8"), "text/html")

      const bundleAsScript = async (script: HTMLScriptElement) => {
        const modes = script.dataset.bundle.split(",").map(s => s.trim().toLowerCase())

        delete script.dataset.bundle

        if (script.src) {
          const url = new URL(script.src)

          if (url.protocol !== "file:")
            throw new Error("Unsupported protocol")

          using stack = new DisposableStack()

          const nonce = crypto.randomUUID().slice(0, 8)
          const input = path.join(path.dirname(exitpoint), `./${nonce}.js`)

          writeFileSync(input, `export * from "${path.resolve(url.pathname)}";`)

          stack.defer(() => rmSync(input, { force: true }))

          if (modes.includes("client")) {
            script.src = `/${path.relative(this.exitrootdir, await this.client.include(input))}`

            writeFileSync(exitpoint, `<!DOCTYPE html>\n${entrydocument.documentElement.outerHTML}`)
          } else {
            script.remove()

            writeFileSync(exitpoint, `<!DOCTYPE html>\n${entrydocument.documentElement.outerHTML}`)
          }

          if (modes.includes("static")) {
            const output = await this.server.include(input)

            using _ = await mutex.lockOrWait()

            const exitwindow = new Window({ url: "file://" + path.resolve(exitpoint) });
            const exitdocument = new exitwindow.DOMParser().parseFromString(readFileSync(exitpoint, "utf8"), "text/html")

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.window = exitwindow

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.document = exitdocument

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.location = exitwindow.location

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

            writeFileSync(exitpoint, `<!DOCTYPE html>\n${exitdocument.documentElement.outerHTML}`)
          }

          return
        } else {
          using stack = new DisposableStack()

          const nonce = crypto.randomUUID().slice(0, 8)
          const input = path.join(path.dirname(exitpoint), `./${nonce}.js`)

          stack.defer(() => rmSync(input, { force: true }))

          writeFileSync(input, script.textContent)

          if (modes.includes("client")) {
            const output = await this.client.include(input)

            stack.defer(() => rmSync(output, { force: true }))

            script.textContent = `\n    ${readFileSync(output, "utf8").trim()}\n  `

            writeFileSync(exitpoint, `<!DOCTYPE html>\n${entrydocument.documentElement.outerHTML}`)
          } else {
            script.remove()

            writeFileSync(exitpoint, `<!DOCTYPE html>\n${entrydocument.documentElement.outerHTML}`)
          }

          if (modes.includes("static")) {
            const server = await this.server.include(input)

            using _ = await mutex.lockOrWait()

            const exitwindow = new Window({ url: "file://" + path.resolve(exitpoint) });
            const exitdocument = new exitwindow.DOMParser().parseFromString(readFileSync(exitpoint, "utf8"), "text/html")

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.window = exitwindow

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.document = exitdocument

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            globalThis.location = exitwindow.location

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

            writeFileSync(exitpoint, `<!DOCTYPE html>\n${exitdocument.documentElement.outerHTML}`)
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

        using stack = new DisposableStack()

        const nonce = crypto.randomUUID().slice(0, 8)
        const input = path.join(path.dirname(exitpoint), `./${nonce}.css`)

        stack.defer(() => rmSync(input, { force: true }))

        writeFileSync(input, `@import "${path.resolve(url.pathname)}";`)

        const output = await this.client.include(input)

        link.href = redot(path.relative(path.dirname(exitpoint), output))

        writeFileSync(exitpoint, `<!DOCTYPE html>\n${entrydocument.documentElement.outerHTML}`)
      }

      const bundleAsStyle = async (style: HTMLStyleElement) => {

      }

      const promises = new Array<Promise<void>>()

      for (const link of entrydocument.querySelectorAll("link[rel=stylesheet][data-bundle]"))
        promises.push(bundleAsStylesheetLink(link as unknown as HTMLLinkElement))
      for (const style of entrydocument.querySelectorAll("style[data-bundle]"))
        promises.push(bundleAsStyle(style as unknown as HTMLStyleElement))
      for (const script of entrydocument.querySelectorAll("script[data-bundle]"))
        promises.push(bundleAsScript(script as unknown as HTMLScriptElement))

      await Promise.all(promises)
    }

    const promises = new Array<Promise<void>>()

    for (const entrypoint of walkSync(this.entryrootdir)) {
      if (entrypoint.endsWith(".html")) {
        promises.push(bundleAsHtml(entrypoint))
        continue
      }

      // const exitpoint = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      // mkdirSync(path.dirname(exitpoint), { recursive: true })

      // writeFileSync(exitpoint, readFileSync(entrypoint))
    }

    console.log(this.client.inputs)

    await this.client.collect()

    // TODO: wait for Deno.bundle to be fixed
    await new Promise(ok => setImmediate(ok))

    console.log(this.server.inputs)

    await this.server.collect()

    await Promise.all(promises)
  }

}