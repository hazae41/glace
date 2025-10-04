#!/usr/bin/env node

import process from "node:process";
import React from "react";
import { Glace } from "./mods/glace/mod.tsx";

React;

const options: {
  entryrootdir?: string;
  exitrootdir?: string;
  development?: boolean;
} = {}

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]

  if (arg.startsWith("--out=")) {
    options.exitrootdir = arg.slice("--out=".length)
    continue
  }

  if (arg.startsWith("--out")) {
    options.exitrootdir = process.argv[++i]
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

  options.entryrootdir = arg
}

const {
  entryrootdir = "./src",
  exitrootdir = "./dst",
  development = false
} = options

await new Glace(entryrootdir, exitrootdir, development).bundle()

process.exit(0)