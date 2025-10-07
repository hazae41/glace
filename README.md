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

- Works with any client-side and/or static-side framework (e.g. React)
- Focused on security and simplicity without degrading performances
- Supply-chain hardened with the bare minimum dependencies
- Built on web principles with HTML-in-HTML-out bundling
- Immutably cached with either manual or automatic updates
- Built for Deno but backward compatible with Node/Bun
- Deploy it anywhere HTML/CSS/JS files can be stored
- Builds are cross-platform cross-runtime reproducible

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