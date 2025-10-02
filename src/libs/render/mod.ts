import type { ReactNode } from "react";
import { prerender } from "react-dom/static";

export async function prerenderToString(node: ReactNode) {
  using stack = new DisposableStack()

  const stream = await prerender(node)
  const reader = stream.prelude.getReader()

  stack.defer(() => reader.releaseLock())

  let html = ""

  for (let result = await reader.read(); !result.done; result = await reader.read())
    html += new TextDecoder().decode(result.value)

  return html
}