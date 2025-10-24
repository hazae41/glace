# Glace

Build a webapp with security in mind

```bash
npm install -D @hazae41/glace
```

```bash
deno install -gfn glace -RW jsr:@hazae41/glace/bin
```

[**📦 NPM**](https://www.npmjs.com/package/@hazae41/glace) • [**📦 JSR**](https://jsr.io/@hazae41/glace)

## Features

- Built on web standards and fundamentals
- Works with any client-side and/or static-side library (e.g. React, jQuery)
- Focused on security and simplicity without degrading performances
- Supply-chain hardened with the bare minimum dependencies
- Built for Deno but backward compatible with Node/Bun
- Deploy it anywhere HTML/CSS/JS files can be stored
- Builds are cross-platform cross-runtime reproducible

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

You can branch on browser or static execution using `process.env.PLATFORM`

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

### Generated paths

You can generate paths using brackets as parameters

And parameters will be available in `location` as search params

> ./www/[lang].html

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Example</title>
  <script type="module">
    if (process.env.PLATFORM !== "browser") {
      document.documentElement.lang = new URLSearchParams(location.search).get("lang")
    }
  </script>
</head>

</html>
```

> ./www/manifest.json

```json
{
  "short_name": "Example",
  "name": "Example",
  "paths": {
    {
      "lang": "en"
    },
    {
      "lang": "fr"
    },
    {
      "lang": "es"
    },
    {
      "lang": "de"
    }
  }
}
```

Will output

- > ./out/en.html

- > ./out/fr.html

- > ./out/es.html

- > ./out/de.html

And you can use multiple parameters

> ./www/posts/[post]/[name].html

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Example</title>
  <script type="module">
    if (process.env.PLATFORM !== "browser") {
      const params = new URLSearchParams(location.search)

      document.title = params.get("name")

      document.body.innerHTML = await fetch(`/api/posts/${params.get("post")}`).then(r => r.text())
    }
  </script>
</head>

</html>
```

> ./www/manifest.json

```json
{
  "short_name": "Example",
  "name": "Example",
  "paths": {
    {
      "post": 1,
      "name": "how-to-start-coding"
    },
    {
      "post": 2,
      "name": "how-to-choose-a-license"
    },
    {
      "post": 3,
      "name": "how-to-deploy-a-website"
    }
  }
}
```

Will output

- > ./out/posts/1/how-to-start-coding.html

- > ./out/posts/2/how-to-choose-a-license.html

- > ./out/posts/3/how-to-deploy-a-website.html

You can write your own script that will fetch your database and fill `manifest.json`

> ./scripts/generate.ts

```tsx
const manifest = await readFile("./www/manifest.json", "utf-8").then(JSON.parse)

const posts = await fetch("https://example.com/api/posts").then(r => r.json())

for (const { id, title } of posts)
  manifest.paths.push[{ post: id, name: title.replaceAll(" ", "-").toLowerCase() }]

await writeFile("./www/manifest.json", JSON.stringify(manifest, null, 2))
```

```bash
deno -RWN ./scripts/generate.ts
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
      document.body.innerHTML = `<div>Copyright ${new Date().getUTCFullYear()}</div>`
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
  <div>Copyright 2025</div>
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
    document.body.innerHTML = `<div>Copyright ${new Date().getUTCFullYear()}</div>`
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
    document.body.innerHTML = `<div>Copyright ${new Date().getUTCFullYear()}</div>`
  </script>
</head>

<body>
  <div>Copyright 2025</div>
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