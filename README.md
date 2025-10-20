# Glace

Create immutable websites

```bash
npm install -D @hazae41/glace
```

```bash
deno install -gfn glace -RW jsr:@hazae41/glace/bin
```

[**📦 NPM**](https://www.npmjs.com/package/@hazae41/glace) • [**📦 JSR**](https://jsr.io/@hazae41/glace)

## Features

- Works with any client-side and/or static-side library (e.g. React, jQuery)
- Focused on security and simplicity without degrading performances
- Supply-chain hardened with the bare minimum dependencies
- Built for Deno but backward compatible with Node/Bun
- Deploy it anywhere HTML/CSS/JS files can be stored
- Builds are cross-platform cross-runtime reproducible
- (soon) Immutably cached with either manual or automatic updates
- (soon) Can be integrity checked at runtime using HTTPSec protocol

## Starters

- [@hazae41/starter](https://github.com/hazae41/starter) / Start a cool webapp with React and Tailwind

## Usage

### Bash 

```bash
glace ./www --out=./dst --dev --watch
```

### Code

```tsx
await new Glace("./www", "./dst", "production").build()
```

## Features

### .bundleignore

You can put a `.bundleignore` file at the root of your input directory to ignore some files

> ./www/.bundleignore

```gitignore
manifest.json
/assets/*
```

Those files will be copied as-is without any bundling

### JS/TS(X), CSS, JSON files

Those files will be bundled for the client unless explicitly ignored (see previous section)

### HTML files

#### Scripts

Any `<script>` will be bundled and then executed with the HTML file set for `document` and `location`

```html
<script type="module">
  document.body.innerHTML = `<div>Built at ${Date.now()}</div>`
</script>
```

You can branch on browser or static execution

```html
<script type="module">
  if (process.env.PLATFORM === "browser") {
    console.log("Hello from browser")
  } else {
    console.log("Hello from bundler")
  }
</script>
```

#### Subresource Integrity

All scripts, whether inline or external, will have their `integrity` attribute automatically computed. 

```html
<script type="module" src="./index.tsx"></script>
```

```html
<script type="module" src="./index.js" integrity="sha256-xP+cym0GRdm2J0F0v39EBGjOtHbuY8qEHoeQrqrhgcs="></script>
```

External scripts will also be included in a `modulepreload` link

```html
<link rel="modulepreload" href="./index.js" integrity="sha256-xP+cym0GRdm2J0F0v39EBGjOtHbuY8qEHoeQrqrhgcs=" />
```

And an importmap will be generated with the integrity of external scripts

```html
<script type="importmap">{"integrity":{"./index.js":"sha256-xP+cym0GRdm2J0F0v39EBGjOtHbuY8qEHoeQrqrhgcs="}}</script>
```

#### Self Integrity

You can put `FINAL_HTML_HASH` into any inline script to replace it by the Base64-encoded SHA-256 hash of the final HTML file

```html
<script type="module" id="main">
  if (process.env.PLATFORM === "browser") {
    console.log("expected", "FINAL_HTML_HASH")

    main.integrity = "sha256-taLJYlBhI2bqJy/6xtl0Sq9LRarNlqp8/Lkx7jtVglk="

    const dummy = new XMLSerializer().serializeToString(document).replaceAll("FINAL_HTML_HASH", "DUMMY_HTML_HASH")
    const shaed = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dummy))).toBase64()

    console.log("computed", `sha256-${shaed}`)
  }
</script>
```

Note that in the preimage, `FINAL_HTML_HASH` is replaced by `DUMMY_HTML_HASH`, and the inline script `integrity` attribute is set to `sha256-taLJYlBhI2bqJy/6xtl0Sq9LRarNlqp8/Lkx7jtVglk=` (SHA-256 of `dummy`)

### manifest.json

At the end of the build, all non-hidden files will have their integrity computed and stored into `manifest.json`, except for the service worker (see below)

### Service-worker

If you set `background.service_worker` to an output file path in `manifest.json`, it will be injected by replacing `FILES` by a `[string, string][]` mapping of all files and their integrity

```json
{
  "name": "Example",
  "short_name": "Example",
  "description": "An example webapp",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/favicon.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "background": {
    "service_worker": "/service.worker.js"
  }
}
```

You can then use `FILES` to cache all your webapp files

```tsx
import { immutable } from "@hazae41/immutable"

declare const FILES: [string, string][]

const cache = new immutable.cache.Cache(new Map(FILES))

self.addEventListener("install", (event) => {
  /**
   * Precache new version and auto-activate
   */
  event.waitUntil(cache.precache().then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  /**
   * Take control of all clients and uncache previous versions
   */
  event.waitUntil(self.clients.claim().then(() => cache.uncache()))
})

self.addEventListener("fetch", (event) => {
  const response = cache.handle(event.request)

  if (response == null)
    return

  /**
   * Respond with cache
   */
  event.respondWith(response)
})
```

## Examples

### A simple HTML file with prerendering

> ./www/index.html

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Example</title>
  <script type="module">
    if (process.env.PLATFORM !== "browser") 
      document.body.innerHTML = `<div>${Date.now()}</div>`
    }
  </script>
</head>

</html>
```

Will output

```html
<!DOCTYPE html>
<html lang="en">
  
<head>
  <title>Example</title>
</head>

<body>
  <div>1759832747706</div>
</body>

</html>
```

### A simple HTML file with prerendering and hydration

> ./www/index.html

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Example</title>
  <script type="module">
    document.body.innerHTML = `<div>${Date.now()}</div>`
  </script>
</head>

</html>
```

Will output

```html
<!DOCTYPE html>
<html lang="en">
  
<head>
  <title>Example</title>
  <script type="module">
    document.body.innerHTML = `<div>${Date.now()}</div>`
  </script>
</head>

<body>
  <div>1759832747706</div>
</body>

</html>
```

### A simple React and Tailwind app with prerendering and hydration using Rewind

```bash
npm i react react-dom @types/react @types/react-dom @hazae41/rewind
```

> ./www/index.html

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Example</title>
  <script type="module" src="./index.tsx"></script>
  <link rel="stylesheet" data-rewind href="./index.css" />
</head>

</html>
```

> ./www/index.css

```css
@import "tailwindcss/index";

.big {
  @apply text-3xl;
}
```

> ./www/index.tsx

```tsx
import { Rewind } from "@hazae41/rewind";
import React, { type ReactNode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";

React;

export function App() {
  useEffect(() => {
    console.log("Hello world");
  }, [])

  return <div className="text-red-500 big">
    Hello world
  </div>
}

if (process.env.PLATFORM === "browser") {
  await new Rewind(document).hydrateOrThrow().then(() => hydrateRoot(document.body, <App />))
} else {
  const prerender = async (node: ReactNode) => {
    const ReactDOM = await import("react-dom/static")

    using stack = new DisposableStack()

    const stream = await ReactDOM.default.prerender(node)
    const reader = stream.prelude.getReader()

    stack.defer(() => reader.releaseLock())

    let html = ""

    for (let result = await reader.read(); !result.done; result = await reader.read())
      html += new TextDecoder().decode(result.value)

    return html
  }

  document.body.innerHTML = await prerender(<App />)

  await new Rewind(document).prerenderOrThrow()
}
```