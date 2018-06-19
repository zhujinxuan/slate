import { LEAF, UNSET, UNDEFINED } from './constants'

/**
 * Set a value at a key path in a tree of Map, creating Maps on the go.
 *
 * @param {Map} map
 * @param {Array} keys
 * @param {Any} value
 * @return {Map}
 */

export default function setIn(map, keys, value, options = {}) {
  const { type } = options

  if (type === 'last') {
    return last(map, keys, value)
  }

  let parent = map
  let child

  for (const key of keys) {
    child = parent.get(key)

    // If the path was not created yet...
    if (child === UNSET) {
      child = new Map() // eslint-disable-line no-undef,no-restricted-globals
      parent.set(key, child)
    }

    parent = child
  }

  // The whole path has been created, so set the value to the bottom most map.
  child.set(LEAF, value === undefined ? UNDEFINED : value)
  return map
}

/**
 * Set a value at a key path in a tree of Map, and overwrite the existing
 * cache for the same method
 *
 * @param {Map} map
 * @param {Array} keys
 * @param {Any} value
 * @return {Map}
 */

function last(map, keys, value) {
  const method = keys[0]
  map.set(method, {
    keys,
    value,
  })
  return map
}
