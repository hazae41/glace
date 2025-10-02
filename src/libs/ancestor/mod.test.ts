import { assert, test, throws } from "@hazae41/phobos";
import { ancestor } from "./mod.ts";

test("ancestor", () => {
  assert(ancestor.posix(["/aaa/bbbb/ccc/index.html", "/aaa/ddd/index.html"]) === "/aaa")
  assert(ancestor.win32(["C:\\aaa\\bbbb\\ccc\\index.html", "C:\\aaa\\ddd\\index.html"]) === "C:\\aaa")

  assert(ancestor.posix(["/aaa/index.html", "/bbb/index.html"]) === "/")
  assert(throws(() => ancestor.win32(["C:\\aaa\\index.html", "D:\\aaa\\index.html"])))

  assert(ancestor.posix(["/aaa/index.html", "/aaa/bbb/index.html", "/aaa/bbb/ccc/index.html"]) === "/aaa")
  assert(ancestor.win32(["C:\\aaa\\index.html", "C:\\aaa\\bbb\\index.html", "C:\\aaa\\bbb\\ccc\\index.html"]) === "C:\\aaa")
})