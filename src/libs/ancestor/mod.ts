import path from "node:path";

export function ancestor(paths: readonly string[]) {
  if (path.sep === "/")
    return ancestor.posix(paths);
  else
    return ancestor.win32(paths);
}

export namespace ancestor {

  export function win32(paths: readonly string[]) {
    function common(x: string, y: string) {
      const [a, b] = [x, y].map(x => path.win32.resolve(x).split("\\"))

      let i = 0;

      while (i < a.length && i < b.length && a[i] === b[i])
        i++;

      if (i === 0)
        throw new Error("No common drive")

      return a.slice(0, i).join("\\");
    }

    return paths.reduce((d, x) => common(d, path.win32.dirname(x)), path.win32.dirname(paths[0]));
  }

  export function posix(paths: readonly string[]) {
    function common(x: string, y: string) {
      const [a, b] = [x, y].map(x => path.posix.resolve(x).split("/").slice(1))

      let i = 0;

      while (i < a.length && i < b.length && a[i] === b[i])
        i++;

      if (i === 0)
        return "/"

      return `/${a.slice(0, i).join("/")}`;
    }

    return paths.reduce((d, x) => common(d, path.posix.dirname(x)), path.posix.dirname(paths[0]));
  }

}
