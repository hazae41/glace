import type { Nullable } from "@/libs/nullable/mod.ts";

export namespace cartese {

  export function* generate(target: string, params: Nullable<Record<string, string[]>>): Generator<Record<string, string>> {
    if (params == null) {
      yield {}
      return
    }

    const entries = Object.entries(params)

    function* recurse(index = 0, current = {}) {
      const entry = entries[index]

      if (entry == null) {
        yield current
        return
      }

      const [key, options] = entry

      if (!target.includes(`[${key}]`)) {
        yield* recurse(index + 1, current)
        return
      }

      for (const option of options)
        yield* recurse(index + 1, { ...current, [key]: option })

      return
    }

    yield* recurse();
  }

  export function resolve(target: string, params: Record<string, string>): string {
    let result = target

    for (const param in params)
      result = result.replaceAll(`[${param}]`, params[param])

    return result
  }

}