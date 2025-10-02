/// <reference lib="dom" />

import React, { useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { log } from "../src/chunk.tsx";

React;

export function App() {
  return <Test />
}

function Test() {
  useEffect(() => {
    log("hello");
  }, [])

  return <div>Hello world</div>
}

if (typeof document !== "undefined") {
  hydrateRoot(document.getElementById("root")!, <App />);
} 