// deno-lint-ignore-file no-process-global
/// <reference lib="dom" />

import React, { type ReactNode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";

React;

export function App() {
  useEffect(() => {
    console.log("hello");
  }, [])

  return <div>Hello world</div>
}

let html: string;

if (process.env.NODE_ENV === "production" || typeof window !== "undefined") {
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

  html = await prerender(<App />)
}

export { html };
