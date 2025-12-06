#!/usr/bin/env node

// deno-lint-ignore-file no-unused-vars

import { watch } from "node:fs";
import process from "node:process";
import { Glace } from "./mods/glace/mod.ts";

const options: {
  input?: string;
  output?: string;
  watch?: string | true
  mode?: "development" | "production"
} = {}

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]

  if (arg.startsWith("--out=")) {
    options.output = arg.slice("--out=".length)
    continue
  }

  if (arg.startsWith("--watch=")) {
    options.watch = arg.slice("--watch=".length)
    continue
  }

  if (arg.startsWith("--dev=")) {
    options.mode = arg.slice("--dev=".length) === "true" ? "development" : "production"
    continue
  }

  if (arg === "--watch") {
    options.watch = true
    continue
  }

  if (arg === "--dev") {
    options.mode = "development"
    continue
  }

  options.input = arg
}

const {
  input = "./src",
  output = "./dst",
  mode = process.env.NODE_ENV === "development" ? "development" : "production"
} = options

const glace = new Glace(input, output, mode)

await glace.build()

if (!options.watch)
  process.exit(0)

let timeout: number | undefined

const watched = options.watch === true ? input : options.watch

watch(watched, {
  recursive: true
}, (event, filename) => {
  if (filename.startsWith("."))
    return

  clearTimeout(timeout)

  timeout = setTimeout(() => glace.build().catch(console.error), 300)

  return
})