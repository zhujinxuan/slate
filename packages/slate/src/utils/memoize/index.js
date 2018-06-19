/* global Map */
import { UNDEFINED, UNSET } from './constants'
import getIn from './getIn'
import setIn from './setIn'

/**
 * GLOBAL: True if memoization should is enabled.
 *
 * @type {Boolean}
 */

let ENABLED = true

/**
 * GLOBAL: Changing this cache key will clear all previous cached results.
 *
 * @type {Number}
 */

let CACHE_KEY = 0

/**
 * Memoize all of the `properties` on a `object`.
 *
 * @param {Object} object
 * @param {Array} properties
 * @return {Record}
 */

function memoize(object, properties, options = {}) {
  for (const property of properties) {
    const original = object[property]

    if (!original) {
      throw new Error(`Object does not have a property named "${property}".`)
    }

    object[property] = function(...args) {
      // If memoization is disabled, call into the original method.
      if (!ENABLED) return original.apply(this, args)

      // If the cache key is different, previous caches must be cleared.
      if (CACHE_KEY !== this.__cache_key) {
        this.__cache_key = CACHE_KEY
        this.__cache = new Map() // eslint-disable-line no-restricted-globals
        this.__cache_no_args = {}
      }

      if (!this.__cache) {
        this.__cache = new Map() // eslint-disable-line no-restricted-globals
      }
      if (!this.__cache_no_args) {
        this.__cache_no_args = {}
      }

      const takesArguments = args.length !== 0

      if (!takesArguments) {
        const cachedValue = this.__cache_no_args[property]

        // If we've got a result already, return it.
        if (cachedValue !== UNSET) {
          return cachedValue === UNDEFINED ? undefined : cachedValue
        }

        const value = original.apply(this, args)
        const v = value === undefined ? UNDEFINED : value
        this.__cache_no_args[property] = v
        return value
      }

      const keys = [property, ...args]
      const cachedValue = getIn(this.__cache, keys, options)

      // If we've got a result already, return it.
      if (cachedValue !== UNSET) {
        return cachedValue === UNDEFINED ? undefined : cachedValue
      }

      // Otherwise calculate what it should be once and cache it.
      const value = original.apply(this, args)
      this.__cache = setIn(this.__cache, keys, value, options)

      return value
    }
  }
}

/**
 * In DEV mode, clears the previously memoized values, globally.
 *
 * @return {Void}
 */

function resetMemoization() {
  CACHE_KEY++

  if (CACHE_KEY >= Number.MAX_SAFE_INTEGER) {
    CACHE_KEY = 0
  }
}

/**
 * In DEV mode, enable or disable the use of memoize values, globally.
 *
 * @param {Boolean} enabled
 * @return {Void}
 */

function useMemoization(enabled) {
  ENABLED = enabled
}

/**
 * Export.
 *
 * @type {Object}
 */

export default memoize
export { resetMemoization, useMemoization }
