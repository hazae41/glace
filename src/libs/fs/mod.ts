import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function mkdirAndWriteFileSync(file: string, data: string | NodeJS.ArrayBufferView) {
  mkdirSync(path.dirname(file), { recursive: true })

  writeFileSync(file, data)
}