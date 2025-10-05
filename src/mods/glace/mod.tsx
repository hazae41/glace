import { bundle } from "@/libs/bundle/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { walkSync } from "@/libs/walk/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLLinkElement, type HTMLScriptElement, type HTMLStyleElement } from "happy-dom";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ancestor } from "../../libs/ancestor/mod.ts";
import { mkdirAndWriteFileSync } from "../../libs/fs/mod.ts";

const mglobal = new Mutex(globalThis)

export class Bundler {

  readonly inputs = new Set<string>()

  readonly result = Promise.withResolvers<void>()

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly development: boolean
  ) { }

  async include(file: string) {
    const name = path.basename(file, path.extname(file))

    const outname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)) ? ".js" : path.extname(file))
    const outfile = path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname)

    this.inputs.add(file)

    await this.result.promise

    if (!existsSync(outfile))
      throw new Error("Output not found")

    return outfile
  }

  async bundle() {
    const inputs = [...this.inputs]
    const outdir = path.join(this.exitrootdir, path.relative(this.entryrootdir, ancestor(inputs)))

    for await (const output of bundle(inputs, outdir, this.development))
      mkdirAndWriteFileSync(output.path, output.text)

    this.result.resolve()
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

            using lglobal = await mglobal.lockOrWait()

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lglobal.value.window = window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lglobal.value.document = document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lglobal.value.location = window.location

            await import(path.resolve(output))

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lglobal.value.window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lglobal.value.document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lglobal.value.location
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

            using lglobal = await mglobal.lockOrWait()

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lglobal.value.window = window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lglobal.value.document = document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            lglobal.value.location = window.location

            await import(path.resolve(output))

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lglobal.value.window

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lglobal.value.document

            // deno-lint-ignore ban-ts-comment
            // @ts-ignore
            delete lglobal.value.location
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

        mkdirAndWriteFileSync(input, `@import "${path.resolve(url.pathname)}";`)

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

      mkdirAndWriteFileSync(exitpoint, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`)
    }

    const bundleAsScript = async (entrypoint: string) => {
      ignored.add(path.resolve(entrypoint))

      const input = path.join(tmpdir(), path.relative(this.entryrootdir, entrypoint))

      mkdirAndWriteFileSync(input, `export * from "${path.resolve(entrypoint)}";`)

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

      mkdirAndWriteFileSync(exitpoint, readFileSync(entrypoint))
    }

    await this.client.bundle()

    await Promise.resolve()

    await this.server.bundle()

    await Promise.all(promises)

    return
  }

}