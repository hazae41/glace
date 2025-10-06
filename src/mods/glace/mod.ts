import { Bundler } from "@/libs/bundle/mod.ts";
import { mkdirAndWriteFile } from "@/libs/fs/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { walk } from "@/libs/walk/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLLinkElement, type HTMLScriptElement, type HTMLStyleElement } from "happy-dom";
import crypto from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class Glace {

  readonly client: Bundler
  readonly statxc: Bundler

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly mode: "production" | "development"
  ) {
    this.client = new Bundler(this.entryrootdir, this.exitrootdir, "browser", this.mode)
    this.statxc = new Bundler(this.entryrootdir, tmpdir(), "node", this.mode)
  }

  async bundle() {
    const mutex = new Mutex(undefined)

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

          if (modes.includes("client")) {
            const output = this.client.include(url.pathname)

            yield

            script.src = redot(path.relative(path.dirname(exitpoint), output))
          } else {
            yield

            script.remove()
          }

          if (modes.includes("static")) {
            const output = this.statxc.include(url.pathname)

            yield

            await import(path.resolve(output))
          }

          return
        } else {
          await using stack = new AsyncDisposableStack()

          const dummy = path.join(path.dirname(entrypoint), `./${crypto.randomUUID().slice(0, 8)}.js`)

          await mkdirAndWriteFile(dummy, script.textContent)

          stack.defer(() => rm(dummy, { force: true }))

          if (modes.includes("client")) {
            const output = this.client.include(dummy)

            yield

            script.textContent = `\n    ${await readFile(output, "utf8").then(x => x.trim())}\n  `

            await rm(output, { force: true })
          } else {
            yield

            script.remove()
          }

          if (modes.includes("static")) {
            const output = this.statxc.include(dummy)

            yield

            await import(path.resolve(output))
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

        const output = this.client.include(url.pathname)

        yield

        link.href = redot(path.relative(path.dirname(exitpoint), output))

        return
      }).bind(this)

      const bundleAsStyle = (async function* (this: Glace, style: HTMLStyleElement) {
        await using stack = new AsyncDisposableStack()

        delete style.dataset.bundle

        const dummy = path.join(path.dirname(entrypoint), `./${crypto.randomUUID().slice(0, 8)}.css`)

        await mkdirAndWriteFile(dummy, style.textContent)

        stack.defer(() => rm(dummy, { force: true }))

        const output = this.client.include(dummy)

        yield

        style.textContent = `\n    ${await readFile(output, "utf8").then(x => x.trim())}\n  `

        await rm(output, { force: true })

        return
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

      window.location.href = `file://${path.resolve(exitpoint)}`

      using _ = await mutex.lockOrWait()

      // @ts-expect-error:
      globalThis.window = window

      // @ts-expect-error:
      globalThis.document = document

      // @ts-expect-error:
      globalThis.location = window.location

      while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done)));

      // @ts-expect-error:
      delete globalThis.window

      // @ts-expect-error:
      delete globalThis.document

      // @ts-expect-error:
      delete globalThis.location

      await mkdirAndWriteFile(exitpoint, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`)

      return
    }).bind(this)

    const bundles = new Array<AsyncGenerator<void, void, unknown>>()

    for await (const entrypoint of walk(this.entryrootdir)) {
      if (entrypoint.endsWith(".html")) {
        bundles.push(bundleAsHtml(entrypoint))
        continue
      }

      if ([".css", ".js", ".jsx", ".ts", ".tsx"].some(x => entrypoint.endsWith(x))) {
        this.client.include(path.resolve(entrypoint))
        continue
      }

      await mkdirAndWriteFile(path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint)), await readFile(entrypoint))
    }

    await Promise.all(bundles.map(g => g.next()))

    await this.client.bundle()

    await Promise.all(bundles.map(g => g.next()))

    await this.statxc.bundle()

    while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done)));
  }

}