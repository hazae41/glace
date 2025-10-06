#!/usr/bin/env node

import { watch } from "node:fs";
import process from "node:process";
import React from "react";
import { Glace } from "./mods/glace/mod.ts";

React;

const options: {
  input?: string;
  output?: string;
  watch?: boolean
  mode?: "development" | "production"
} = {}

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]

  if (arg.startsWith("--out=")) {
    options.output = arg.slice("--out=".length)
    continue
  }

  if (arg.startsWith("--out")) {
    options.output = process.argv[++i]
    continue
  }

  if (arg.startsWith("--watch=")) {
    options.watch = arg.slice("--watch=".length) === "true"
    continue
  }

  if (arg.startsWith("--watch")) {
    options.watch = true
    continue
  }

  if (arg.startsWith("--dev=")) {
    options.mode = arg.slice("--dev=".length) === "true" ? "development" : "production"
    continue
  }

  if (arg.startsWith("--dev")) {
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

let timeout: number | undefined

if (options.watch)
  watch(input, () => { clearTimeout(timeout); timeout = setTimeout(() => glace.build().catch(console.error), 100) })
else
  process.exit(0)