import { Builder } from "@/libs/bundle/mod.ts";
import { mkdirAndWriteFile, readFileAsListOrEmpty } from "@/libs/fs/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLLinkElement, type HTMLScriptElement, type HTMLStyleElement } from "happy-dom";
import crypto from "node:crypto";
import { glob, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class Glace {

  readonly client: Builder
  readonly statxc: Builder

  constructor(
    readonly entryrootdir: string,
    readonly exitrootdir: string,
    readonly mode: "production" | "development"
  ) {
    this.client = new Builder(this.entryrootdir, this.exitrootdir, "browser", this.mode)
    this.statxc = new Builder(this.entryrootdir, tmpdir(), "node", this.mode)
  }

  async build() {
    const start = performance.now()

    this.client.clear()
    this.statxc.clear()

    const mutex = new Mutex(undefined)

    const bundleAsHtml = (async function* (this: Glace, entrypoint: string) {
      const exitpoint = path.resolve(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      const window = new Window({ url: "file://" + entrypoint });
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
            const output = this.client.add(url.pathname)

            yield

            script.src = redot(path.relative(path.dirname(exitpoint), output))
          } else {
            yield

            script.remove()
          }

          if (modes.includes("static")) {
            const output = this.statxc.add(url.pathname)

            yield

            await import(`file:${output}#${crypto.randomUUID().slice(0, 8)}`)
          }

          return
        } else {
          await using stack = new AsyncDisposableStack()

          const dummy = path.join(path.dirname(entrypoint), `./${crypto.randomUUID().slice(0, 8)}.js`)

          await mkdirAndWriteFile(dummy, script.textContent)

          stack.defer(() => rm(dummy, { force: true }))

          if (modes.includes("client")) {
            const output = this.client.add(dummy)

            yield

            script.textContent = `\n    ${await readFile(output, "utf8").then(x => x.trim())}\n  `

            await rm(output, { force: true })
          } else {
            yield

            script.remove()
          }

          if (modes.includes("static")) {
            const output = this.statxc.add(dummy)

            yield

            await import(`file:${output}#${crypto.randomUUID().slice(0, 8)}`)
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

        const output = this.client.add(url.pathname)

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

        const output = this.client.add(dummy)

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

      window.location.href = `file://${exitpoint}`

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

    const exclude = await readFileAsListOrEmpty(path.join(this.entryrootdir, "./.bundleignore"))

    for await (const child of glob("**/*", { cwd: this.entryrootdir, exclude })) {
      const relative = child.toString()
      const absolute = path.resolve(this.entryrootdir, relative)

      const stats = await stat(absolute)

      if (stats.isDirectory())
        continue

      if (relative.endsWith(".html")) {
        bundles.push(bundleAsHtml(absolute))
        continue
      }

      this.client.add(absolute)
    }

    for await (const child of glob(exclude, { cwd: this.entryrootdir })) {
      const relative = child.toString()
      const absolute = path.resolve(this.entryrootdir, relative)

      const stats = await stat(absolute)

      if (stats.isDirectory())
        continue

      await mkdirAndWriteFile(path.join(this.exitrootdir, relative), await readFile(absolute))
    }

    await Promise.all(bundles.map(g => g.next()))

    await this.client.build()

    await Promise.all(bundles.map(g => g.next()))

    await this.statxc.build()

    while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done)));

    console.log(`Built in ${Math.round(performance.now() - start)}ms`)
  }

}