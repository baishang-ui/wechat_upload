export type SetDataPrimitive = string | number | boolean | null

/** Builds the smallest setData payload for a group of primitive view-state fields. */
export function buildChangedDataPatch<T extends Record<string, SetDataPrimitive>>(
  current: Partial<Record<keyof T, unknown>>,
  next: T,
): Partial<T> {
  const patch: Partial<T> = {}
  ;(Object.keys(next) as Array<keyof T>).forEach((key) => {
    if (!Object.is(current[key], next[key])) patch[key] = next[key]
  })
  return patch
}
