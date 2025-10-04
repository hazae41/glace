import { bundle } from "@/libs/bundle/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { walkSync } from "@/libs/walk/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLLinkElement, type HTMLScriptElement, type HTMLStyleElement } from "happy-dom";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ancestor } from "../../libs/ancestor/mod.ts";

const global = new Mutex(globalThis)

export class Bundler {

  readonly inputs = new Map<string, string>()

  readonly outputs = Promise.withResolvers<Map<string, string>>()

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly development: boolean
  ) { }

  async include(input: string) {
    const name = path.basename(input, path.extname(input))

    const rawname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(input)) ? ".js" : path.extname(input))
    const tracker = path.relative(this.entryrootdir, path.join(path.dirname(input), `./${rawname}`))

    this.inputs.set(tracker, input)

    const result = await this.outputs.promise

    const output = result.get(tracker)

    if (output == null)
      throw new Error("Output not found")

    return output
  }

  async collect() {
    const renames = new Map<string, string>()
    const outputs = new Map<string, string>()

    const entrycommondir = ancestor([...this.inputs.values()])
    const exitcommondir = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrycommondir))

    for await (const output of bundle([...this.inputs.values()], exitcommondir, this.development)) {
      mkdirSync(path.dirname(output.path), { recursive: true })

      const name = path.basename(output.path, path.extname(output.path))

      const rawname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(output.path)) ? ".js" : path.extname(output.path))
      const tracker = path.relative(this.exitrootdir, path.join(path.dirname(output.path), `./${rawname}`))

      if (this.inputs.get(tracker) == null) {
        const rename = crypto.createHash("sha256").update(output.text).digest("hex").slice(0, 8)
        const repath = path.join(path.dirname(output.path), `./${rename}` + path.extname(output.path))

        writeFileSync(repath, output.text)

        renames.set(name, rename)
        outputs.set(tracker, repath)

        continue
      }

      writeFileSync(output.path, output.text)

      outputs.set(tracker, output.path)
    }

    for (const repath of outputs.values()) {
      let text = readFileSync(repath, "utf8")

      for (const [name, rename] of renames.entries())
        text = text.replaceAll(name, rename)

      writeFileSync(repath, text)
    }

    this.outputs.resolve(outputs)
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
    this.client = new Bundler(tmpdir(), this.exitrootdir, this.development)
    this.server = new Bundler(tmpdir(), tmpdir(), true)

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
          if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
            throw new Error("Out of bound")

          ignored.add(url.pathname)

          const input = path.join(tmpdir(), path.relative(this.entryrootdir, url.pathname))

          mkdirSync(path.dirname(input), { recursive: true })

          writeFileSync(input, `export * from "${path.resolve(url.pathname)}";`)

          if (modes.includes("client")) {
            script.src = redot(path.relative(path.dirname(exitpoint), await this.client.include(input)))
          } else {
            script.remove()
          }

          if (modes.includes("static")) {
            const output = await this.server.include(input)

            window.location.href = `file://${path.resolve(exitpoint)}`

            using lock = await global.lockOrWait()

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lock.value.window = window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lock.value.document = document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lock.value.location = window.location

            await import(path.resolve(output))

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lock.value.window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lock.value.document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lock.value.location
          }

          return
        } else {
          const input = path.join(tmpdir(), path.relative(this.entryrootdir, path.dirname(entrypoint)), `./${crypto.randomUUID().slice(0, 8)}.js`)

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

            window.location.href = `file://${path.resolve(exitpoint)}`

            using lock = await global.lockOrWait()

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lock.value.window = window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lock.value.document = document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lock.value.location = window.location

            await import(path.resolve(output))

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lock.value.window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lock.value.document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lock.value.location
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

        if (url.protocol !== "file:")
          throw new Error("Unsupported protocol")
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          throw new Error("Out of bound")

        ignored.add(url.pathname)

        const input = path.join(tmpdir(), path.relative(this.entryrootdir, url.pathname))

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

    const bundleAsScript = async (entrypoint: string) => {
      ignored.add(entrypoint)

      const input = path.join(tmpdir(), path.relative(this.entryrootdir, entrypoint))

      mkdirSync(path.dirname(input), { recursive: true })

      writeFileSync(input, `export * from "${path.resolve(entrypoint)}";`)

      await this.client.include(input)
    }

    const promises = new Array<Promise<void>>()

    for (const entrypoint of walkSync(this.entryrootdir)) {
      if (entrypoint.endsWith(".html")) {
        promises.push(bundleAsHtml(entrypoint))
        continue
      }

      if ([".js", ".jsx", ".ts", ".tsx"].some(x => entrypoint.endsWith(x))) {
        promises.push(bundleAsScript(entrypoint))
        continue
      }
    }

    for (const entrypoint of walkSync(this.entryrootdir)) {
      if (ignored.has(path.resolve(entrypoint)))
        continue

      const exitpoint = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      mkdirSync(path.dirname(exitpoint), { recursive: true })

      writeFileSync(exitpoint, readFileSync(entrypoint))
    }

    await this.client.collect()

    await Promise.resolve()

    await this.server.collect()

    await Promise.all(promises)

    return
  }

}