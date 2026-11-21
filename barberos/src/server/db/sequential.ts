/**
 * Runs queries one after another. A transaction holds a single connection, so
 * `Promise.all` gains nothing there, and the `pg` driver is dropping support for overlapping queries.
 */
export async function sequential<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: () => PromiseLike<T[K]> },
): Promise<T> {
  const out: unknown[] = [];
  for (const task of tasks) out.push(await task());
  return out as unknown as T;
}
