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
    console.log("Building...")

    const start = performance.now()

    this.client.clear()
    this.statxc.clear()

    await rm(this.exitrootdir, { recursive: true, force: true })

    const mutex = new Mutex(undefined)

    const bundleAsHtml = (async function* (this: Glace, entrypoint: string) {
      const exitpoint = path.resolve(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))

      const window = new Window({ url: "file://" + entrypoint });
      const document = new window.DOMParser().parseFromString(await readFile(entrypoint, "utf8"), "text/html")

      const integrity: Record<string, string> = {}

      const bundleAsScript = (async function* (this: Glace, script: HTMLScriptElement) {
        if (script.src) {
          const url = new URL(script.src)

          if (url.protocol !== "file:")
            return
          if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
            return

          const client = this.client.add(url.pathname)

          yield

          script.src = redot(path.relative(path.dirname(exitpoint), client))
          script.integrity = this.client.integrity[client]

          const directory = path.dirname(exitpoint)

          for (const imported of this.client.importeds[client]) {
            const relative = redot(path.relative(directory, imported))

            integrity[relative] = this.client.integrity[imported]

            const link = document.createElement("link")

            link.rel = "modulepreload"
            link.href = relative

            link.setAttribute("integrity", this.client.integrity[imported])

            document.head.prepend(link)
          }

          const relative = redot(path.relative(directory, client))

          integrity[relative] = this.client.integrity[client]

          const link = document.createElement("link")

          link.rel = "modulepreload"
          link.href = relative

          link.setAttribute("integrity", this.client.integrity[client])

          document.head.prepend(link)

          const statxc = this.statxc.add(url.pathname)

          yield

          await import(`file:${statxc}#${crypto.randomUUID().slice(0, 8)}`)

          return
        } else {
          await using stack = new AsyncDisposableStack()

          const dummy = path.join(path.dirname(entrypoint), `./.${crypto.randomUUID().slice(0, 8)}.js`)

          await mkdirAndWriteFile(dummy, script.textContent)

          stack.defer(() => rm(dummy, { force: true }))

          const client = this.client.add(dummy)

          yield

          script.textContent = await readFile(client, "utf8")
          script.integrity = this.client.integrity[client]

          const directory = path.dirname(exitpoint)

          for (const imported of this.client.importeds[client]) {
            const relative = redot(path.relative(directory, imported))

            integrity[relative] = this.client.integrity[imported]

            const link = document.createElement("link")

            link.rel = "modulepreload"
            link.href = relative

            link.setAttribute("integrity", this.client.integrity[imported])

            document.head.prepend(link)
          }

          await rm(client, { force: true })

          const statxc = this.statxc.add(dummy)

          yield

          await import(`file:${statxc}#${crypto.randomUUID().slice(0, 8)}`)

          yield

          if (script.textContent.includes("FINAL_HTML_HASH")) {
            script.integrity = "sha256-taLJYlBhI2bqJy/6xtl0Sq9LRarNlqp8/Lkx7jtVglk=" // sha256("dummy")

            const data = new window.XMLSerializer().serializeToString(document).replaceAll("FINAL_HTML_HASH", "DUMMY_HTML_HASH")
            const hash = `sha256-${crypto.createHash("sha256").update(data).digest("base64")}`

            script.textContent = script.textContent.replaceAll("FINAL_HTML_HASH", hash)
            script.integrity = `sha256-${crypto.createHash("sha256").update(script.textContent).digest("base64")}`
          }

          return
        }
      }).bind(this)

      const bundleAsStylesheetLink = (async function* (this: Glace, link: HTMLLinkElement) {
        const url = new URL(link.href)

        if (url.protocol !== "file:")
          return
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          return

        const client = this.client.add(url.pathname)

        yield

        link.href = redot(path.relative(path.dirname(exitpoint), client))

        link.setAttribute("integrity", this.client.integrity[client])

        return
      }).bind(this)

      // deno-lint-ignore require-yield
      const bundleAsModulepreloadLink = (async function* (this: Glace, link: HTMLLinkElement) {
        const url = new URL(link.href)

        if (url.protocol !== "file:")
          return
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          return

        const relative = path.relative(path.dirname(exitpoint), url.pathname)

        const data = await readFile(url.pathname)
        const hash = crypto.createHash("sha256").update(data).digest("base64")

        link.setAttribute("integrity", `sha256-${hash}`)

        integrity[relative] = `sha256-${hash}`

        return
      }).bind(this)

      // deno-lint-ignore require-yield
      const bundleAsPreloadLink = (async function* (this: Glace, link: HTMLLinkElement) {
        const url = new URL(link.href)

        if (url.protocol !== "file:")
          return
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          return

        const data = await readFile(url.pathname)
        const hash = crypto.createHash("sha256").update(data).digest("base64")

        link.setAttribute("integrity", `sha256-${hash}`)

        return
      }).bind(this)

      const bundleAsStyle = (async function* (this: Glace, style: HTMLStyleElement) {
        await using stack = new AsyncDisposableStack()

        const dummy = path.join(path.dirname(entrypoint), `./.${crypto.randomUUID().slice(0, 8)}.css`)

        await mkdirAndWriteFile(dummy, style.textContent)

        stack.defer(() => rm(dummy, { force: true }))

        const output = this.client.add(dummy)

        yield

        style.textContent = `\n    ${await readFile(output, "utf8").then(x => x.trim())}\n  `

        await rm(output, { force: true })

        return
      }).bind(this)

      const bundles = new Array<AsyncGenerator<void, void, unknown>>()

      for (const script of document.querySelectorAll("script"))
        bundles.push(bundleAsScript(script as unknown as HTMLScriptElement))
      for (const style of document.querySelectorAll("style"))
        bundles.push(bundleAsStyle(style as unknown as HTMLStyleElement))
      for (const link of document.querySelectorAll("link[rel=stylesheet]"))
        bundles.push(bundleAsStylesheetLink(link as unknown as HTMLLinkElement))
      for (const link of document.querySelectorAll("link[rel=preload]"))
        bundles.push(bundleAsPreloadLink(link as unknown as HTMLLinkElement))
      for (const link of document.querySelectorAll("link[rel=modulepreload]"))
        bundles.push(bundleAsModulepreloadLink(link as unknown as HTMLLinkElement))

      await Promise.all(bundles.map(g => g.next()))

      yield

      await Promise.all(bundles.map(g => g.next()))

      yield

      const importmap = document.createElement("script")

      importmap.type = "importmap"
      importmap.textContent = JSON.stringify({ integrity })

      document.head.prepend(importmap)

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

      await mkdirAndWriteFile(exitpoint, new window.XMLSerializer().serializeToString(document))

      return
    }).bind(this)

    const touches = new Array<Promise<void>>()

    const bundles = new Array<AsyncGenerator<void, void, unknown>>()

    const exclude = await readFileAsListOrEmpty(path.join(this.entryrootdir, "./.bundleignore"))

    for await (const relative of glob("**/*", { cwd: this.entryrootdir, exclude })) {
      const absolute = path.resolve(this.entryrootdir, relative)

      const stats = await stat(absolute)

      if (stats.isDirectory())
        continue

      if (relative.endsWith(".html")) {
        bundles.push(bundleAsHtml(absolute))
        continue
      }

      if (/\.(((c|m)?(t|j)s(x?))|(json)|(css))$/.test(relative)) {
        this.client.add(absolute)
        continue
      }

      touches.push(readFile(absolute).then(x => mkdirAndWriteFile(path.join(this.exitrootdir, relative), x)))
    }

    for await (const relative of glob(exclude, { cwd: this.entryrootdir })) {
      const absolute = path.resolve(this.entryrootdir, relative)

      const stats = await stat(absolute)

      if (stats.isDirectory())
        continue

      touches.push(readFile(absolute).then(x => mkdirAndWriteFile(path.join(this.exitrootdir, relative), x)))
    }

    await Promise.all(touches)

    await Promise.all(bundles.map(g => g.next()))

    await this.client.build()

    await Promise.all(bundles.map(g => g.next()))

    await this.statxc.build()

    while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done)));

    const manifestAsPath = path.join(this.exitrootdir, "./manifest.json")
    const manifestAsJson = await readFile(manifestAsPath, "utf8").then(x => JSON.parse(x)).catch(() => ({}))

    manifestAsJson.files = []

    for await (const relative of glob("**/*", { cwd: this.exitrootdir, exclude })) {
      const absolute = path.resolve(this.exitrootdir, relative)

      const stats = await stat(absolute)

      if (stats.isDirectory())
        continue

      const data = await readFile(absolute)
      const hash = crypto.createHash("sha256").update(data).digest()

      const integrity = `sha256-${hash.toString("base64")}`

      manifestAsJson.files.push({ src: "/" + relative, integrity })

      const extname = path.extname(absolute)
      const rawname = path.basename(absolute, extname)

      if (rawname.endsWith(".latest")) {
        const name = path.basename(rawname, ".latest")

        const vrelative = path.join(path.dirname(relative), `./${name}.${hash.toString("hex").slice(0, 6)}` + extname)
        const vabsolute = path.resolve(this.exitrootdir, vrelative)

        await mkdirAndWriteFile(vabsolute, data)

        manifestAsJson.files.push({ src: "/" + vrelative, integrity })

        continue
      }
    }

    await mkdirAndWriteFile(manifestAsPath, JSON.stringify(manifestAsJson, null, 2))

    console.log(`Built in ${Math.round(performance.now() - start)}ms`)
  }

}