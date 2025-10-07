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

- [@hazae41/starter](https://github.com/hazae41/starter) / Start a cool website with React and Tailwind

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

The content of HTML files can be bundled with a `data-bundle` attribute:

- Put `data-bundle` on a `<link>` or `<style>` to enable bundling and rewriting its path if any

```html
 <link rel="stylesheet" data-bundle href="./index.css" />
```

```html
<style data-bundle>
  @import "tailwindcss/index";
</style>
```

- Put `data-bundle` on a `<script>` tag with a value containing any of "client" or "static" separated by a comma
  - "client" will bundle it and then include it in the output and then rewrite its path in the HTML file
  - "static" will bundle it and then execute it with the HTML file set for `document` and `location`

```html
<script type="module" data-bundle="client,static" src="./app/index.tsx">
```

```html
<script type="module" data-bundle="client" src="./polyfill.tsx">
```

```html
<script type="module" data-bundle="static">
  document.body.innerHTML = `<div>Built at ${Date.now()}</div>`
</script>
```

## Examples

### A simple HTML file with prerendering

> ./www/index.html

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Example</title>
  <script type="module" data-bundle="static">
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
  <script type="module" data-bundle="static,client">
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
  <script type="module" data-bundle="client,static" src="./index.tsx"></script>
  <link rel="stylesheet" data-bundle data-rewind href="./index.css" />
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