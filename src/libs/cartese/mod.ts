// deno-lint-ignore-file no-namespace

export namespace cartese {

  export function* match(target: string, paths: Record<string, string>[]) {
    const pattern = /\[([^\]]+)\]/g
    const matches = [...target.matchAll(pattern)]

    let found = false

    for (const params of paths) {
      const keys = Object.keys(params)

      if (keys.length !== matches.length)
        continue
      if (!matches.every((match) => keys.includes(match[1])))
        continue

      found = true

      yield params
    }

    if (!found)
      yield {}

    return
  }

  export function replace(target: string, params: Record<string, string>): string {
    let result = target

    for (const param in params)
      result = result.replaceAll(`[${param}]`, params[param])

    return result
  }

}