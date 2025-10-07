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