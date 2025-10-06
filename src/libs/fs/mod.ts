import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function mkdirAndWriteFile(file: string, data: string | NodeJS.ArrayBufferView) {
  await mkdir(path.dirname(file), { recursive: true })

  await writeFile(file, data)
}

export function mkdirAndWriteFileSync(file: string, data: string | NodeJS.ArrayBufferView) {
  mkdirSync(path.dirname(file), { recursive: true })

  writeFileSync(file, data)
}

export async function readFileAsListOrEmpty(file: string) {
  return existsSync(file) ? await readFile(file, "utf8").then(x => x.split("\n")) : []
}