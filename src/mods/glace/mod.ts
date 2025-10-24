import { Builder } from "@/libs/bundle/mod.ts";
import { cartese } from "@/libs/cartese/mod.ts";
import { mkdirAndWriteFileIfNotExists, readFileAsListOrEmpty } from "@/libs/fs/mod.ts";
import { redot } from "@/libs/redot/mod.ts";
import { Mutex } from "@hazae41/mutex";
import { Window, type HTMLLinkElement, type HTMLScriptElement, type HTMLStyleElement } from "happy-dom";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { glob, readFile, rm, stat, writeFile } from "node:fs/promises";
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
    const tmp = path.join(tmpdir(), crypto.randomUUID().slice(0, 8))

    this.client = new Builder(this.entryrootdir, this.exitrootdir, "browser", this.mode)
    this.statxc = new Builder(this.entryrootdir, tmp, "node", this.mode)
  }

  async build() {
    console.log("Building...")

    const start = performance.now()

    this.client.clear()
    this.statxc.clear()

    await rm(this.exitrootdir, { recursive: true, force: true })

    const mutex = new Mutex(undefined)

    const bundleAsHtml = (async function* (this: Glace, entrypoint: string, params: Record<string, string> = {}) {
      const exitpoint = cartese.replace(path.resolve(path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))), params)

      const entrypointdir = path.dirname(entrypoint)
      const exitpointdir = path.dirname(exitpoint)

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
          if (!existsSync(url.pathname))
            return

          const rawclientexitpoint = this.client.add(url.pathname)
          const rawstatxcexitpoint = this.statxc.add(url.pathname)

          yield

          const client = this.client.outputs.get(rawclientexitpoint)

          const clientexitpoint = cartese.replace(client.path, params)

          await mkdirAndWriteFileIfNotExists(clientexitpoint, client.contents)

          const relative = redot(path.relative(exitpointdir, clientexitpoint))

          integrity[relative] = client.hash

          script.src = relative
          script.integrity = client.hash

          const link = document.createElement("link")

          link.rel = "modulepreload"
          link.href = relative

          link.setAttribute("integrity", client.hash)

          document.head.prepend(link)

          yield

          const statxc = this.statxc.outputs.get(rawstatxcexitpoint)

          const statxcexitpoint = cartese.replace(statxc.path, params)

          await mkdirAndWriteFileIfNotExists(statxcexitpoint, statxc.contents)

          using _ = await mutex.lockOrWait()

          // @ts-expect-error:
          globalThis.window = window

          // @ts-expect-error:
          globalThis.document = document

          // @ts-expect-error:
          globalThis.location = window.location

          await import(`file:${statxcexitpoint}#${crypto.randomUUID().slice(0, 8)}`)

          delete globalThis.window
          delete globalThis.document
          delete globalThis.location

          return
        } else {
          await using stack = new AsyncDisposableStack()

          const dummy = path.resolve(path.join(entrypointdir, `./.${crypto.randomUUID().slice(0, 8)}.js`))

          await mkdirAndWriteFileIfNotExists(dummy, script.textContent)

          stack.defer(() => rm(dummy, { force: true }))

          const rawclientexitpoint = this.client.add(dummy)
          const rawstatxcexitpoint = this.statxc.add(dummy)

          yield

          const client = this.client.outputs.get(rawclientexitpoint)

          script.textContent = client.text
          script.integrity = client.hash

          yield

          const statxc = this.statxc.outputs.get(rawstatxcexitpoint)

          const statxcexitpoint = cartese.replace(statxc.path, params)

          await mkdirAndWriteFileIfNotExists(statxcexitpoint, statxc.contents)

          using _ = await mutex.lockOrWait()

          // @ts-expect-error:
          globalThis.window = window

          // @ts-expect-error:
          globalThis.document = document

          // @ts-expect-error:
          globalThis.location = window.location

          await import(`file:${statxcexitpoint}#${crypto.randomUUID().slice(0, 8)}`)

          delete globalThis.window
          delete globalThis.document
          delete globalThis.location

          return
        }
      }).bind(this)

      const bundleAsStyle = (async function* (this: Glace, style: HTMLStyleElement) {
        await using stack = new AsyncDisposableStack()

        const dummy = path.resolve(path.join(entrypointdir, `./.${crypto.randomUUID().slice(0, 8)}.css`))

        await mkdirAndWriteFileIfNotExists(dummy, style.textContent)

        stack.defer(() => rm(dummy, { force: true }))

        const rawclientexitpoint = this.client.add(dummy)

        yield

        const client = this.client.outputs.get(rawclientexitpoint)

        style.textContent = `\n    ${client.text.trim()}\n  `

        return
      }).bind(this)

      const bundleAsStylesheetLink = (async function* (this: Glace, link: HTMLLinkElement) {
        const url = new URL(link.href)

        if (url.protocol !== "file:")
          return
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          return
        if (!existsSync(url.pathname))
          return

        const rawclientexitpoint = this.client.add(url.pathname)

        yield

        const client = this.client.outputs.get(rawclientexitpoint)

        const clientexitpoint = cartese.replace(client.path, params)

        await mkdirAndWriteFileIfNotExists(clientexitpoint, client.contents)

        link.href = redot(path.relative(exitpointdir, clientexitpoint))

        link.setAttribute("integrity", client.hash)

        return
      }).bind(this)

      // deno-lint-ignore require-yield
      const bundleAsModulepreloadLink = (async function* (this: Glace, link: HTMLLinkElement) {
        const url = new URL(link.href)

        if (url.protocol !== "file:")
          return
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          return
        if (!existsSync(url.pathname))
          return

        const data = await readFile(url.pathname)
        const hash = crypto.createHash("sha256").update(data).digest("base64")

        link.setAttribute("integrity", `sha256-${hash}`)

        return
      }).bind(this)

      // deno-lint-ignore require-yield
      const bundleAsPreloadLink = (async function* (this: Glace, link: HTMLLinkElement) {
        const url = new URL(link.href)

        if (url.protocol !== "file:")
          return
        if (path.relative(this.entryrootdir, url.pathname).startsWith(".."))
          return
        if (!existsSync(url.pathname))
          return

        const data = await readFile(url.pathname)
        const hash = crypto.createHash("sha256").update(data).digest("base64")

        link.setAttribute("integrity", `sha256-${hash}`)

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

      await Promise.all(bundles.map(g => g.next())) // prepare clients

      yield // wait client build

      await Promise.all(bundles.map(g => g.next())) // finalize clients and prepare statics

      yield // wait static build

      const importmap = document.createElement("script")

      importmap.type = "importmap"
      importmap.textContent = JSON.stringify({ integrity })

      document.head.prepend(importmap)

      window.location.href = `file://${exitpoint}?${new URLSearchParams(params).toString()}`

      while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done))); // finalize statics

      await mkdirAndWriteFileIfNotExists(exitpoint, new window.XMLSerializer().serializeToString(document))

      return
    }).bind(this)

    const bundleAsOther = (async function* (this: Glace, entrypoint: string, params: Record<string, string> = {}) {
      const rawclientexitpoint = this.client.add(entrypoint)

      yield

      const client = this.client.outputs.get(rawclientexitpoint)

      const clientexitpoint = cartese.replace(client.path, params)

      await mkdirAndWriteFileIfNotExists(clientexitpoint, client.contents)

      return
    }).bind(this)

    const copyAsAsset = (async function* (this: Glace, entrypoint: string, params: Record<string, string> = {}) {
      const exitpoint = cartese.replace(path.resolve(path.join(this.exitrootdir, path.relative(this.entryrootdir, entrypoint))), params)

      yield

      await mkdirAndWriteFileIfNotExists(exitpoint, await readFile(entrypoint))
    }).bind(this)

    const bundles = new Array<AsyncGenerator<void, void, unknown>>()

    const manifestentrypoint = path.resolve(path.join(this.entryrootdir, "./manifest.json"))
    const manifest = await readFile(manifestentrypoint, "utf8").then(x => JSON.parse(x)).catch(() => ({}))

    const exclude = await readFileAsListOrEmpty(path.resolve(path.join(this.entryrootdir, "./.bundleignore")))

    for await (const relative of glob("**/*", { cwd: this.entryrootdir, exclude })) {
      const entrypoint = path.resolve(path.join(this.entryrootdir, relative))

      const stats = await stat(entrypoint)

      if (stats.isDirectory())
        continue

      for (const params of cartese.match(entrypoint, manifest.paths)) {
        if (relative.endsWith(".html")) {
          bundles.push(bundleAsHtml(entrypoint, params))
          continue
        }

        if (/\.((c|m)?(t|j)s(x?))$/.test(relative)) {
          bundles.push(bundleAsOther(entrypoint, params))
          continue
        }

        if (/\.(css)$/.test(relative)) {
          bundles.push(bundleAsOther(entrypoint, params))
          continue
        }

        bundles.push(copyAsAsset(entrypoint, params))
      }
    }

    for await (const relative of glob(exclude, { cwd: this.entryrootdir })) {
      const entrypoint = path.resolve(path.join(this.entryrootdir, relative))

      const stats = await stat(entrypoint)

      if (stats.isDirectory())
        continue

      for (const params of cartese.match(entrypoint, manifest.paths))
        bundles.push(copyAsAsset(entrypoint, params))

      continue
    }

    await Promise.all(bundles.map(g => g.next())) // prepare clients

    await this.client.build() // build clients

    await Promise.all(bundles.map(g => g.next())) // finalize clients and prepare statics

    await this.statxc.build() // build statics

    while (await Promise.all(bundles.map(g => g.next())).then(a => a.some(x => !x.done))); // finalize statics

    const [serviceworkerexitpoint] = [manifest.background?.service_worker].map(x => x != null ? path.resolve(path.join(this.exitrootdir, x)) : null)

    const files = new Array<[string, string]>()

    for await (const relative of glob("**/*", { cwd: this.exitrootdir })) {
      const absolute = path.resolve(path.join(this.exitrootdir, relative))

      if (absolute === serviceworkerexitpoint)
        continue

      const stats = await stat(absolute)

      if (stats.isDirectory())
        continue

      const data = await readFile(absolute, "utf8")
      const hash = crypto.createHash("sha256").update(data).digest()

      files.push(["/" + relative, `sha256-${hash.toString("base64")}`])
    }

    if (serviceworkerexitpoint != null && existsSync(serviceworkerexitpoint)) {
      const original = await readFile(serviceworkerexitpoint, "utf8")
      const replaced = original.replaceAll("FILES", JSON.stringify(files))

      await writeFile(serviceworkerexitpoint, replaced)
    }

    console.log(`Built in ${Math.round(performance.now() - start)}ms`)
  }

}