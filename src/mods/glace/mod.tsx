import { ancestor } from "@/libs/ancestor/mod.ts";
import { bundle } from "@/libs/bundle/mod.ts";
import { mkdirAndWriteFile } from "@/libs/fs/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { walk } from "@/libs/walk/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLLinkElement, type HTMLScriptElement, type HTMLStyleElement } from "happy-dom";
import crypto from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const mutex = new Mutex(undefined)

export class Bundler {

  readonly inputs = new Set<string>()

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly development: boolean,
    readonly platform: "browser" | "node"
  ) { }

  include(file: string) {
    const name = path.basename(file, path.extname(file))

    const outname = name + ([".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)) ? ".js" : path.extname(file))
    const outfile = path.join(this.exitrootdir, path.relative(this.entryrootdir, path.dirname(file)), outname)

    this.inputs.add(file)

    return outfile
  }

  async bundle() {
    if (this.inputs.size === 0)
      return

    const inputs = [...this.inputs]
    const outdir = path.join(this.exitrootdir, path.relative(this.entryrootdir, ancestor(inputs)))

    for await (const output of bundle(inputs, outdir, this.development, this.platform))
      await mkdirAndWriteFile(output.path, output.text)

    return
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
    this.client = new Bundler(tmpdir(), this.exitrootdir, this.development, "browser")
    this.server = new Bundler(tmpdir(), tmpdir(), this.development, "node")

    return
  }

  async bundle() {
    await using stack = new AsyncDisposableStack()

    const bundleAsHtml = (async function* (this: Glace, entrypoint: string) {
      const exitpoint = path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      const window = new Window({ url: "file://" + path.resolve(entrypoint) });
      const document = new window.DOMParser().parseFromString(await readFile(entrypoint, "utf8"), "text/html")

      const bundleAsScript = (async function* (this: Glace, script: HTMLScriptElement) {
        const modes = script.dataset.bundle.split(",").map(s => s.trim().toLowerCase())

        delete script.dataset.bundle

        if (script.src) {
          const url = new URL(script.src)

          if (url.protocol !== "file:")
            throw new Error("Unsupported protocol")
          if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
            throw new Error("Out of bound")

          stack.defer(() => rm(path.join(this.exitrootdir, path.relative(this.entryrootdir, url.pathname)), { force: true }))

          const input = path.join(tmpdir(), path.relative(this.entryrootdir, url.pathname))

          await mkdirAndWriteFile(input, `export * from "${path.resolve(url.pathname)}";`)

          if (modes.includes("client")) {
            const output = this.client.include(input)

            yield

            script.src = redot(path.relative(path.dirname(exitpoint), output))
          } else {
            yield

            script.remove()
          }

          if (modes.includes("static")) {
            const output = this.server.include(input)

            yield

            window.location.href = `file://${path.resolve(exitpoint)}`

            using _ = await mutex.lockOrWait()

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
          const input = path.join(tmpdir(), path.relative(this.entryrootdir, path.dirname(entrypoint)), `./${crypto.randomUUID().slice(0, 8)}.js`)

          await mkdirAndWriteFile(input, script.textContent)

          if (modes.includes("client")) {
            const output = this.client.include(input)

            yield

            script.textContent = `\n    ${await readFile(output, "utf8").then(x => x.trim())}\n  `

            await rm(output, { force: true })
          } else {
            yield

            script.remove()
          }

          if (modes.includes("static")) {
            const output = this.server.include(input)

            yield

            window.location.href = `file://${path.resolve(exitpoint)}`

            using _ = await mutex.lockOrWait()

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
        }
      }).bind(this)

      const bundleAsStylesheetLink = (async function* (this: Glace, link: HTMLLinkElement) {
        delete link.dataset.bundle

        const url = new URL(link.href)

        if (url.protocol !== "file:")
          throw new Error("Unsupported protocol")
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          throw new Error("Out of bound")

        stack.defer(() => rm(path.join(this.exitrootdir, path.relative(this.entryrootdir, url.pathname)), { force: true }))

        const input = path.join(tmpdir(), path.relative(this.entryrootdir, url.pathname))

        await mkdirAndWriteFile(input, `@import "${path.resolve(url.pathname)}";`)

        const output = this.client.include(input)

        yield

        link.href = redot(path.relative(path.dirname(exitpoint), output))

        return
      }).bind(this)

      const bundleAsStyle = (async function* (this: Glace, style: HTMLStyleElement) {

      }).bind(this)

      const bundles = new Array<AsyncGenerator<void, void, unknown>>()

      for (const script of document.querySelectorAll("script[data-bundle]"))
        bundles.push(bundleAsScript(script as unknown as HTMLScriptElement))
      for (const style of document.querySelectorAll("style[data-bundle]"))
        bundles.push(bundleAsStyle(style as unknown as HTMLStyleElement))
      for (const link of document.querySelectorAll("link[rel=stylesheet][data-bundle]"))
        bundles.push(bundleAsStylesheetLink(link as unknown as HTMLLinkElement))

      await Promise.all(bundles.map(g => g.next()))

      yield

      await Promise.all(bundles.map(g => g.next()))

      yield

      while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done)));

      await mkdirAndWriteFile(exitpoint, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`)

      return
    }).bind(this)

    // deno-lint-ignore require-yield
    const bundleAsScript = (async function* (this: Glace, entrypoint: string) {
      stack.defer(() => rm(path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint)), { force: true }))

      const input = path.join(tmpdir(), path.relative(this.entryrootdir, entrypoint))

      await mkdirAndWriteFile(input, `export * from "${path.resolve(entrypoint)}";`)

      this.client.include(input)

      return
    }).bind(this)

    const bundles = new Array<AsyncGenerator<void, void, unknown>>()

    for await (const entrypoint of walk(this.entryrootdir)) {
      if (entrypoint.endsWith(".html")) {
        bundles.push(bundleAsHtml(entrypoint))
        continue
      }

      if ([".js", ".jsx", ".ts", ".tsx"].some(x => entrypoint.endsWith(x))) {
        bundles.push(bundleAsScript(entrypoint))
        continue
      }

      await mkdirAndWriteFile(path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint)), await readFile(entrypoint))
    }

    await Promise.all(bundles.map(g => g.next()))

    await this.client.bundle()

    await Promise.all(bundles.map(g => g.next()))

    await this.server.bundle()

    while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done)));
  }

}