// deno-lint-ignore-file no-process-global
/// <reference lib="dom" />

import React, { type ReactNode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { log } from "../src/chunk.tsx";

React;

export function App() {
  useEffect(() => {
    log("hello");
  }, [])

  return <div>Hello world</div>
}

let html: string;

if (process.env.NODE_ENV === "production") {
  hydrateRoot(document.body, <App />);
} else {
  const server = await import("react-dom/static");

  async function prerenderToString(node: ReactNode) {
    using stack = new DisposableStack()

    const stream = await server.default.prerender(node)
    const reader = stream.prelude.getReader()

    stack.defer(() => reader.releaseLock())

    let html = ""

    for (let result = await reader.read(); !result.done; result = await reader.read())
      html += new TextDecoder().decode(result.value)

    return html
  }

  html = await prerenderToString(<App />)
}

export { html };
