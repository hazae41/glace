import { readdirSync } from "node:fs";
import path from "node:path";

export function* walkSync(directory: string): Iterable<string> {
  const files = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name > b.name ? 1 : -1)

  for (const file of files) {
    if (file.isDirectory()) {
      yield* walkSync(path.join(directory, file.name))
    } else {
      yield path.join(directory, file.name)
    }
  }
}