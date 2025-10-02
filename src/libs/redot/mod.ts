export function redot(path: string) {
  return path.startsWith(".") ? path : `./${path}`
}