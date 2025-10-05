/**
 * Transform a list of async generators into a list of promises
 * @param generators 
 */
export async function next(generators: AsyncGenerator<void, void, unknown>[]) {
  const promises = new Array<Promise<IteratorResult<void, void>>>()

  for (const generator of generators)
    promises.push(generator.next())

  return await Promise.all(promises)
}