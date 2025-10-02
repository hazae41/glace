#!/usr/bin/env node

import process from "node:process";
import React from "react";
import { Glace } from "./mods/glace/mod.tsx";

React;

const entrypoints = new Array<string>()

const options: {
  directory?: string;
  development?: boolean;
} = {}

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]

  if (arg.startsWith("--out=")) {
    options.directory = arg.slice("--out=".length)
    continue
  }

  if (arg.startsWith("--out")) {
    options.directory = process.argv[++i]
    continue
  }

  if (arg.startsWith("--dev=")) {
    options.development = arg.slice("--dev=".length) === "true"
    continue
  }

  if (arg.startsWith("--dev")) {
    options.development = true
    continue
  }

  entrypoints.push(arg)
}

const {
  directory = "./dst",
  development = false
} = options

await new Glace(entrypoints, directory, development).bundle()

process.exit(0)