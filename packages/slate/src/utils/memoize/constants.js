/* global Symbol */

/**
 * The leaf node of a cache tree. Used to support variable argument length. A
 * unique object, so that native Maps will key it by reference.
 *
 * @type {Object}
 */

export const LEAF = Symbol('LEAF')

/**
 * A value to represent a memoized undefined value. Allows efficient value
 * retrieval using Map.get only.
 *
 * @type {Object}
 */

export const UNDEFINED = Symbol('UNDEFINED')

/**
 * Default value for unset keys in native Maps
 *
 * @type {Undefined}
 */

export const UNSET = undefined
