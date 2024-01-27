export type Predicate<T> = (value: T) => boolean

export type MaybePredicate<T> = T | Predicate<T>

export function toPredicate<T> (maybe: MaybePredicate<T>): Predicate<T> {
  if (typeof maybe === 'function') return maybe as Predicate<T>

  return value => value === maybe
}
