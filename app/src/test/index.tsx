// deno-lint-ignore-file no-process-global
/// <reference lib="dom" />

import React, { type ReactNode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { log } from "../libs/test/lol/mod.ts";

React;

export function App() {
  useEffect(() => {
    log("Test");
  }, [])

  return <div>Test</div>
}

if (typeof process === "undefined" || process.env.NODE_ENV === "production") {
  hydrateRoot(document.body, <App />);
} else {
  const prerender = async (node: ReactNode) => {
    const { default: { prerender } } = await import("react-dom/static")

    using stack = new DisposableStack()

    const stream = await prerender(node)
    const reader = stream.prelude.getReader()

    stack.defer(() => reader.releaseLock())

    let html = ""

    for (let result = await reader.read(); !result.done; result = await reader.read())
      html += new TextDecoder().decode(result.value)

    return html
  }

  document.body.innerHTML = await prerender(<App />)
}