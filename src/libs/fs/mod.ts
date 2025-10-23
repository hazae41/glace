import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function mkdirAndWriteFileIfNotExists(file: string, data: string | NodeJS.ArrayBufferView) {
  if (existsSync(file))
    return

  await mkdir(path.dirname(file), { recursive: true })

  await writeFile(file, data)
}

export async function readFileAsListOrEmpty(file: string) {
  return existsSync(file) ? await readFile(file, "utf8").then(x => x.split("\n")) : []
}