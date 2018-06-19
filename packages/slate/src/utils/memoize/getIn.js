import { UNSET, LEAF } from './constants'

/**
 * Get a value at a key path in a tree of Map.
 *
 * If not set, returns UNSET.
 * If the set value is undefined, returns UNDEFINED.
 *
 * @param {Map} map
 * @param {Array} keys
 * @return {Any|UNSET|UNDEFINED}
 */

export default function getIn(map, keys, options = {}) {
  const { type } = options
  if (type === 'last') {
    return last(map, keys)
  }

  for (const key of keys) {
    map = map.get(key)
    if (map === UNSET) return UNSET
  }
  return map.get(LEAF)
}

/**
 * Get a value at a key path in a tree of Map,
 * with strategy that only the last value is cached
 *
 * If not set, returns UNSET.
 * If the set value is undefined, returns UNDEFINED.
 *
 * @param {Map} map
 * @param {Array} keys
 * @return {Any|UNSET|UNDEFINED}
 */

function last(map, keys) {
  const method = keys[0]
  const cache = map.get(method)
  if (keys.length !== cache.keys.length) return UNSET
  const invalid = cache.keys.find((v, i) => {
    const paired = keys[i]
    if (v === paired) return false
    if (v && v.equals && v.equals(paired)) return false
    return true
  })
  return invalid ? UNSET : cache.value
}
