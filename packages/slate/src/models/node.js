import direction from 'direction'
import isPlainObject from 'is-plain-object'
import logger from 'slate-dev-logger'
import { List, OrderedSet, Set } from 'immutable'

import Block from './block'
import Data from './data'
import Document from './document'
import Inline from './inline'
import Range from './range'
import Text from './text'
import generateKey from '../utils/generate-key'
import memoize from '../utils/memoize'

/**
 * Node.
 *
 * And interface that `Document`, `Block` and `Inline` all implement, to make
 * working with the recursive node tree easier.
 *
 * @type {Node}
 */

class Node {
  /**
   * Create a new `Node` with `attrs`.
   *
   * @param {Object|Node} attrs
   * @return {Node}
   */

  static create(attrs = {}) {
    if (Node.isNode(attrs)) {
      return attrs
    }

    if (isPlainObject(attrs)) {
      let { object } = attrs

      if (!object && attrs.kind) {
        logger.deprecate(
          'slate@0.32.0',
          'The `kind` property of Slate objects has been renamed to `object`.'
        )
        object = attrs.kind
      }

      switch (object) {
        case 'block':
          return Block.create(attrs)
        case 'document':
          return Document.create(attrs)
        case 'inline':
          return Inline.create(attrs)
        case 'text':
          return Text.create(attrs)
        default: {
          throw new Error('`Node.create` requires a `object` string.')
        }
      }
    }

    throw new Error(
      `\`Node.create\` only accepts objects or nodes but you passed it: ${attrs}`
    )
  }

  /**
   * Create a list of `Nodes` from an array.
   *
   * @param {Array<Object|Node>} elements
   * @return {List<Node>}
   */

  static createList(elements = []) {
    if (List.isList(elements) || Array.isArray(elements)) {
      const list = new List(elements.map(Node.create))
      return list
    }

    throw new Error(
      `\`Node.createList\` only accepts lists or arrays, but you passed it: ${elements}`
    )
  }

  /**
   * Create a dictionary of settable node properties from `attrs`.
   *
   * @param {Object|String|Node} attrs
   * @return {Object}
   */

  static createProperties(attrs = {}) {
    if (Block.isBlock(attrs) || Inline.isInline(attrs)) {
      return {
        data: attrs.data,
        isVoid: attrs.isVoid,
        type: attrs.type,
      }
    }

    if (typeof attrs == 'string') {
      return { type: attrs }
    }

    if (isPlainObject(attrs)) {
      const props = {}
      if ('type' in attrs) props.type = attrs.type
      if ('data' in attrs) props.data = Data.create(attrs.data)
      if ('isVoid' in attrs) props.isVoid = attrs.isVoid
      return props
    }

    throw new Error(
      `\`Node.createProperties\` only accepts objects, strings, blocks or inlines, but you passed it: ${attrs}`
    )
  }

  /**
   * Create a `Node` from a JSON `value`.
   *
   * @param {Object} value
   * @return {Node}
   */

  static fromJSON(value) {
    let { object } = value

    if (!object && value.kind) {
      logger.deprecate(
        'slate@0.32.0',
        'The `kind` property of Slate objects has been renamed to `object`.'
      )
      object = value.kind
    }

    switch (object) {
      case 'block':
        return Block.fromJSON(value)
      case 'document':
        return Document.fromJSON(value)
      case 'inline':
        return Inline.fromJSON(value)
      case 'text':
        return Text.fromJSON(value)
      default: {
        throw new Error(
          `\`Node.fromJSON\` requires an \`object\` of either 'block', 'document', 'inline' or 'text', but you passed: ${value}`
        )
      }
    }
  }

  /**
   * Alias `fromJS`.
   */

  static fromJS = Node.fromJSON

  /**
   * Check if `any` is a `Node`.
   *
   * @param {Any} any
   * @return {Boolean}
   */

  static isNode(any) {
    return (
      Block.isBlock(any) ||
      Document.isDocument(any) ||
      Inline.isInline(any) ||
      Text.isText(any)
    )
  }

  /**
   * Check if `any` is a list of nodes.
   *
   * @param {Any} any
   * @return {Boolean}
   */

  static isNodeList(any) {
    return List.isList(any) && any.every(item => Node.isNode(item))
  }

  /**
   * True if the node has both descendants in that order, false otherwise. The
   * order is depth-first, post-order.
   *
   * @param {String} first
   * @param {String} second
   * @return {Boolean}
   */

  areDescendantsSorted(first, second) {
    first = assertKey(first)
    second = assertKey(second)

    if (first === second) return false
    if (parseInt(first, 10) > parseInt(second, 10)) {
      // Ensure areDescendantSorted(second, first) is also cached
      // Always prefer newer node in second argument, for potential
      // futher optimization
      return !this.areDescendantsSorted(second, first)
    }
    if (first === this.key) return true
    if (second === this.key) return false
    const firstStr = this.getPathAsString(first)
    const secondStr = this.getPathAsString(second)
    return firstStr < secondStr
  }

  /**
   * Assert that a node has a child by `key` and return it.
   *
   * @param {String} key
   * @return {Node}
   */

  assertChild(key) {
    const child = this.getChild(key)

    if (!child) {
      key = assertKey(key)
      throw new Error(`Could not find a child node with key "${key}".`)
    }

    return child
  }

  /**
   * Assert that a node has a descendant by `key` and return it.
   *
   * @param {String} key
   * @return {Node}
   */

  assertDescendant(key) {
    const descendant = this.getDescendant(key)

    if (!descendant) {
      key = assertKey(key)
      throw new Error(`Could not find a descendant node with key "${key}".`)
    }

    return descendant
  }

  /**
   * Assert that a node's tree has a node by `key` and return it.
   *
   * @param {String} key
   * @return {Node}
   */

  assertNode(key) {
    key = assertKey(key)
    if (!this.hasNode(key)) {
      throw new Error(`Could not find a node with key "${key}".`)
    }
    return this.getNode(key)
  }

  /**
   * Assert that a node exists at `path` and return it.
   *
   * @param {Array} path
   * @return {Node}
   */

  assertPath(path) {
    const descendant = this.getDescendantAtPath(path)

    if (!descendant) {
      throw new Error(`Could not find a descendant at path "${path}".`)
    }

    return descendant
  }

  /**
   * Recursively filter all descendant nodes with `iterator`.
   *
   * @param {Function} iterator
   * @return {List<Node>}
   */

  filterDescendants(iterator) {
    const matches = []

    this.forEachDescendant((node, i, nodes) => {
      if (iterator(node, i, nodes)) matches.push(node)
    })

    return List(matches)
  }

  /**
   * Recursively find all descendant nodes by `iterator`.
   *
   * @param {Function} iterator
   * @return {Node|Null}
   */

  findDescendant(iterator) {
    let found = null

    this.forEachDescendant((node, i, nodes) => {
      if (iterator(node, i, nodes)) {
        found = node
        return false
      }
    })

    return found
  }

  /**
   * Recursively iterate over all descendant nodes with `iterator`. If the
   * iterator returns false it will break the loop.
   *
   * @param {Function} iterator
   */

  forEachDescendant(iterator) {
    let ret

    this.nodes.forEach((child, i, nodes) => {
      if (iterator(child, i, nodes) === false) {
        ret = false
        return false
      }

      if (child.object != 'text') {
        ret = child.forEachDescendant(iterator)
        return ret
      }
    })

    return ret
  }

  /**
   * Get the path of ancestors of a descendant node by `key`.
   *
   * @param {String|Node} key
   * @return {List<Node>|Null}
   */

  getAncestors(key) {
    key = assertKey(key)
    if (!this.hasNode(key)) return null
    const path = this.getPath(key)
    return List().withMutations(result => {
      let ancestor = this
      for (const index of path) {
        result.push(ancestor)
        ancestor = ancestor.nodes.get(index)
      }
    })
  }

  /**
   * Get the leaf block descendants of the node.
   *
   * @return {List<Node>}
   */

  getBlocks() {
    const empty = List()
    const { nodes } = this
    return empty.withMutations(result => {
      nodes.forEach(child => {
        if (child.object != 'block') return result
        if (child.isLeafBlock()) return result.push(child)
        // PREF: We shall use concat here when upgrade to immutable v4
        child.getBlocks().forEach(b => result.push(b))
      })
    })
  }

  /**
   * Get the leaf block descendants in a `range`.
   *
   * @param {Range} range
   * @return {List<Node>}
   */

  getBlocksAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return List()
    const { startKey, endKey } = range
    return this.getBlocksBetweenPositions(startKey, endKey)
  }

  /**
   * Cachable Method for getBlocksAtRange
   *
   * @param {string} startKey
   * @param {string} eneKey
   * @return {List<Node>}
   */

  getBlocksBetweenPositions(startKey, endKey) {
    const startBlock = this.getClosestBlock(startKey)

    // PERF: the most common case is when the range is in a single block node,
    // where we can avoid a lot of iterating of the tree.
    if (startKey === endKey) return List.of(startBlock)
    const endBlock = this.getClosestBlock(endKey)

    const blocks = this.getBlocks()
    const start = blocks.indexOf(startBlock)
    const end = blocks.indexOf(endBlock)
    return blocks.slice(start, end + 1)
  }

  /**
   * Get all of the leaf blocks that match a `type`.
   *
   * @param {String} type
   * @return {List<Node>}
   */

  getBlocksByType(type) {
    return this.getBlocks().filter(b => b.type === type)
  }

  /**
   * Get all of the characters for every text node.
   *
   * @return {List<Character>}
   */

  getCharacters() {
    return this.getTexts().flatMap(t => t.characters)
  }

  /**
   * Get a list of the characters in a `range`.
   *
   * @param {Range} range
   * @return {List<Character>}
   */

  getCharactersAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return List()
    const { startKey, endKey, startOffset, endOffset } = range
    const endText = this.getDescendant(endKey)
    if (startKey === endKey) {
      return endText.characters.slice(startOffset, endOffset)
    }

    return this.getTextsAtRange(range).flatMap(t => {
      if (t.key === startKey) {
        return t.characters.slice(startOffset)
      }
      if (t.key === endKey) {
        return t.characters.slice(0, endOffset)
      }
      return t.characters
    })
  }

  /**
   * Get a child node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getChild(key) {
    key = assertKey(key)
    return this.nodes.find(node => node.key == key)
  }

  /**
   * Get closest parent of node by `key` that matches `iterator`.
   *
   * @param {String} key
   * @param {Function} iterator
   * @return {Node|Null}
   */

  getClosest(key, iterator) {
    key = assertKey(key)
    const ancestors = this.getAncestors(key)
    if (!ancestors) {
      throw new Error(`Could not find a descendant node with key "${key}".`)
    }

    // Exclude this node itself.
    const result = ancestors.findLast(iterator)
    return result === this ? undefined : result
  }

  /**
   * Get the closest block parent of a `node`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getClosestBlock(key) {
    return this.getClosest(key, parent => parent.object == 'block')
  }

  /**
   * Get the closest inline parent of a `node`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getClosestInline(key) {
    return this.getClosest(key, parent => parent.object == 'inline')
  }

  /**
   * Get the closest void parent of a `node`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getClosestVoid(key) {
    return this.getClosest(key, parent => parent.isVoid)
  }

  /**
   * Get the common ancestor of nodes `one` and `two` by keys.
   *
   * @param {String} one
   * @param {String} two
   * @return {Node}
   */

  getCommonAncestor(one, two) {
    one = assertKey(one)
    two = assertKey(two)

    if (one == this.key) return this
    if (two == this.key) return this

    if (!this.hasNode(one) || !this.hasNode(two)) {
      throw new Error(`cannot find descendant ${one} or ${two}`)
    }

    if (one === two) return this.getParent(one)
    const pathOne = this.getPathAsString(one)
    const pathTwo = this.getPathAsString(two)

    if (pathOne.charAt(0) !== pathTwo.charAt(0)) return this

    let index = 0
    const length = Math.min(pathOne.length, pathTwo.length)
    while (pathOne.charAt(index) === pathTwo.charAt(index) && index < length) {
      index++
    }

    index = pathOne.lastIndexOf(' ', index)
    if (index === -1) return this
    const commonPath = pathOne
      .slice(0, index)
      .split(' ')
      .map(x => parseInt(x, 10))
    return this.getDescendantAtPath(commonPath)
  }

  /**
   * Get the decorations for the node from a `stack`.
   *
   * @param {Stack} stack
   * @return {List}
   */

  getDecorations(stack) {
    const decorations = stack.find('decorateNode', this)
    const list = Range.createList(decorations || [])
    return list
  }

  /**
   * Get the depth of a child node by `key`, with optional `startAt`.
   *
   * @param {String} key
   * @param {Number} startAt (optional)
   * @return {Number} depth
   */

  getDepth(key, startAt = 1) {
    this.assertDescendant(key)
    const path = this.getPath(key)
    return path.length - 1 + startAt
  }

  /**
   * Get a descendant node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getDescendant(key) {
    key = assertKey(key)
    if (!this.hasNode(key)) return null
    if (this.key === key) return null
    const path = this.getPath(key)
    return this.getDescendantAtPath(path)
  }

  /**
   * Get a descendant by `path`.
   *
   * @param {Array} path
   * @return {Node|Null}
   */

  getDescendantAtPath(path) {
    let descendant = this

    for (const index of path) {
      if (!descendant) return
      if (!descendant.nodes) return
      descendant = descendant.nodes.get(index)
    }

    return descendant
  }

  /**
   * Get the first child text node.
   *
   * @return {Node|Null}
   */

  getFirstText() {
    let descendantFound = null

    const found = this.nodes.find(node => {
      if (node.object == 'text') return true
      descendantFound = node.getFirstText()
      return descendantFound
    })

    return descendantFound || found
  }

  /**
   * Get a fragment of the node at a `range`.
   *
   * @param {Range} range
   * @return {Document}
   */

  getFragmentAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return Document.create()
    const { startKey, startOffset, endKey, endOffset } = range
    return this.getFragmentBetweenPositions(
      startKey,
      startOffset,
      endKey,
      endOffset
    )
  }

  /**
   * Get a fragment of the node between positions; re-argument for cache
   *
   * @param {string} startKey
   * @param {number} startOffset
   * @param {string} endKey
   * @param {number} endOffset
   * @return {Document}
   */

  getFragmentBetweenPositions(startKey, startOffset, endKey, endOffset) {
    let node = this

    // Make sure the children exist.
    const startText = node.assertDescendant(startKey)
    const endText = node.assertDescendant(endKey)

    // Split at the start and end.
    let child = startText
    let previous
    let parent

    while ((parent = node.getParent(child.key))) {
      const index = parent.nodes.indexOf(child)
      const position =
        child.object == 'text' ? startOffset : child.nodes.indexOf(previous)

      parent = parent.splitNode(index, position)
      node = node.updateNode(parent)
      previous = parent.nodes.get(index + 1)
      child = parent
    }

    child = startKey == endKey ? node.getNextText(startKey) : endText

    while ((parent = node.getParent(child.key))) {
      const index = parent.nodes.indexOf(child)
      const position =
        child.object == 'text'
          ? startKey == endKey ? endOffset - startOffset : endOffset
          : child.nodes.indexOf(previous)

      parent = parent.splitNode(index, position)
      node = node.updateNode(parent)
      previous = parent.nodes.get(index + 1)
      child = parent
    }

    // Get the start and end nodes.
    const startNode = node.getNextSibling(
      node.getFurthestAncestor(startKey).key
    )
    const endNode =
      startKey == endKey
        ? node.getNextSibling(
            node.getNextSibling(node.getFurthestAncestor(endKey).key).key
          )
        : node.getNextSibling(node.getFurthestAncestor(endKey).key)

    // Get children range of nodes from start to end nodes
    const startIndex = node.nodes.indexOf(startNode)
    const endIndex = node.nodes.indexOf(endNode)
    const nodes = node.nodes.slice(startIndex, endIndex)

    // Return a new document fragment.
    return Document.create({ nodes })
  }

  /**
   * Get the furthest parent of a node by `key` that matches an `iterator`.
   *
   * @param {String} key
   * @param {Function} iterator
   * @return {Node|Null}
   */

  getFurthest(key, iterator) {
    key = assertKey(key)
    if (!this.hasNode(key)) {
      throw new Error(`Could not find a descendant node with key "${key}".`)
    }
    const path = this.getPath(key)
    let node = this
    for (const index of path) {
      node = node.nodes.get(index)
      if (iterator(node) && node.key !== key) return node
    }
    return null
  }

  /**
   * Get the furthest block parent of a node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getFurthestBlock(key) {
    return this.getFurthest(key, node => node.object == 'block')
  }

  /**
   * Get the furthest inline parent of a node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getFurthestInline(key) {
    return this.getFurthest(key, node => node.object == 'inline')
  }

  /**
   * Get the furthest ancestor of a node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getFurthestAncestor(key) {
    key = assertKey(key)
    if (!this.hasDescendant(key)) return null
    const str = this.getPathAsString(key)
    const strIndex = str.indexOf(' ')
    const index =
      strIndex === -1 ? parseInt(str, 10) : parseInt(str.slice(0, strIndex), 10)
    return this.nodes.get(index)
  }

  /**
   * Get the furthest ancestor of a node by `key` that has only one child.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getFurthestOnlyChildAncestor(key) {
    const ancestors = this.getAncestors(key)

    if (!ancestors) {
      key = assertKey(key)
      throw new Error(`Could not find a descendant node with key "${key}".`)
    }

    const result = ancestors
      // Skip this node...
      .shift()
      // Take parents until there are more than one child...
      .reverse()
      .takeUntil(p => p.nodes.size > 1)
      // And pick the highest.
      .last()
    if (!result) return null
    return result
  }

  /**
   * Get the closest inline nodes for each text node in the node.
   *
   * @return {List<Node>}
   */

  getInlines() {
    const array = this.getInlinesAsArray()
    return new List(array)
  }

  /**
   * Get the closest inline nodes for each text node in the node, as an array.
   *
   * @return {List<Node>}
   */

  getInlinesAsArray() {
    let array = []

    this.nodes.forEach(child => {
      if (child.object == 'text') return
      if (child.isLeafInline()) {
        array.push(child)
      } else {
        array = array.concat(child.getInlinesAsArray())
      }
    })

    return array
  }

  /**
   * Get the closest inline nodes for each text node in a `range`.
   *
   * @param {Range} range
   * @return {List<Node>}
   */

  getInlinesAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return List()
    const { startKey, endKey } = range
    return this.getInlinesBetweenPositions(startKey, endKey)
  }

  /*
   * Cachable function for getInlinesAtRange
   * @param {string} startKey
   * @param {string} endKey
   * @return {List<Node>}
  */

  getInlinesBetweenPositions(startKey, endKey) {
    const texts = new List(
      this.getTextsBetweenPositionsAsArray(startKey, endKey)
    )
    const firstText = texts.find(t => this.getClosestInline(t.key))
    if (!firstText) return List()
    const lastText = texts.findLast(t => this.getClosestInline(t.key))
    const first = this.getClosestInline(firstText.key)
    const last = this.getClosestInline(lastText.key)
    if (first === last) return List.of(first)
    return List.of(first).withMutations(result => {
      let previous = first

      texts.forEach(t => {
        const inline = this.getClosestInline(t.key)
        if (inline === last) {
          result.push(last)
          return false
        }
        if (!inline) return
        if (previous === inline) return
        previous = inline
        result.push(inline)
      })
    })
  }

  /**
   * Get all of the leaf inline nodes that match a `type`.
   *
   * @param {String} type
   * @return {List<Node>}
   */

  getInlinesByType(type) {
    const array = this.getInlinesByTypeAsArray(type)
    return new List(array)
  }

  /**
   * Get all of the leaf inline nodes that match a `type` as an array.
   *
   * @param {String} type
   * @return {Array}
   */

  getInlinesByTypeAsArray(type) {
    return this.nodes.reduce((inlines, node) => {
      if (node.object == 'text') {
        return inlines
      } else if (node.isLeafInline() && node.type == type) {
        inlines.push(node)
        return inlines
      } else {
        return inlines.concat(node.getInlinesByTypeAsArray(type))
      }
    }, [])
  }

  /*
   * get all keys of node as a set; only used for deciding `not in keys` for efficiency
   * for in keys, use assertDescendant, hasDescendant or alike methods
   * @return {Set<string>}
   */

  getKeysAsSet() {
    return Set().withMutations(result => {
      result.add(this.key)
      this.nodes.forEach(n => {
        if (n.object === 'text') return result.add(n.key)
        result.union(n.getKeysAsSet())
      })
    })
  }

  /**
   * Get the last child text node.
   *
   * @return {Node|Null}
   */

  getLastText() {
    let descendantFound = null

    const found = this.nodes.findLast(node => {
      if (node.object == 'text') return true
      descendantFound = node.getLastText()
      return descendantFound
    })

    return descendantFound || found
  }

  /**
   * Get all of the marks for all of the characters of every text node.
   *
   * @return {Set<Mark>}
   */

  getMarks() {
    const array = this.getMarksAsArray()
    return new Set(array)
  }

  /**
   * Get all of the marks for all of the characters of every text node.
   *
   * @return {OrderedSet<Mark>}
   */

  getOrderedMarks() {
    const array = this.getMarksAsArray()
    return new OrderedSet(array)
  }

  /**
   * Get all of the marks as an array.
   *
   * @return {Array}
   */

  getMarksAsArray() {
    return this.nodes.reduce((marks, node) => {
      return marks.concat(node.getMarksAsArray())
    }, [])
  }

  /**
   * Get a set of the marks in a `range`.
   *
   * @param {Range} range
   * @return {Set<Mark>}
   */

  getMarksAtRange(range) {
    return new Set(this.getOrderedMarksAtRange(range))
  }

  /**
   * Get a set of the marks in a `range` for insertion behavior.
   *
   * @param {Range} range
   * @return {Set<Mark>}
   */

  getInsertMarksAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return Set()
    if (range.isCollapsed) {
      return this.getMarksAtPosition(range.startKey, range.startOffset)
    }

    const text = this.getDescendant(range.startKey)
    const char = text.characters.get(range.startOffset)
    if (!char) return Set()

    return char.marks
  }

  /**
   * Get a set of the marks in a `range`.
   *
   * @param {Range} range
   * @return {OrderedSet<Mark>}
   */

  getOrderedMarksAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return OrderedSet()
    if (range.isCollapsed) {
      return this.getMarksAtPosition(range.startKey, range.startOffset)
    }
    const { startKey, startOffset, endKey, endOffset } = range
    return this.getOrderedMarksBetweenPositions(
      startKey,
      startOffset,
      endKey,
      endOffset
    )
  }

  /**
   * Get a set of the marks in a `range`.
   *
   * @param {string} startKey
   * @param {number} startOffset
   * @param {string} endKey
   * @param {number} endOffset
   * @returns {OrderedSet<Mark>}
   */

  getOrderedMarksBetweenPositions(startKey, startOffset, endKey, endOffset) {
    if (startKey === endKey) {
      const startText = this.getDescendant(startKey)
      return startText.getMarksBetweenOffsets(startOffset, endOffset)
    }

    const texts = this.getTextsBetweenPositionsAsArray(startKey, endKey)

    return OrderedSet().withMutations(result => {
      texts.forEach(text => {
        if (text.key === startKey) {
          result.union(
            text.getMarksBetweenOffsets(startOffset, text.text.length)
          )
        } else if (text.key === endKey) {
          result.union(text.getMarksBetweenOffsets(0, endOffset))
        } else {
          result.union(text.getMarks())
        }
      })
    })
  }

  /**
   * Get a set of the active marks in a `range`.
   *
   * @param {Range} range
   * @return {Set<Mark>}
   */

  getActiveMarksAtRange(range) {
    range = range.normalize(this)
    if (range.isUnset) return Set()
    if (range.isCollapsed)
      return this.getMarksAtPosition(range.startKey, range.startOffset).toSet()

    // Otherwise, get a set of the marks for each character in the range.
    const chars = this.getCharactersAtRange(range)
    const first = chars.first()
    if (!first || !first.marks) return Set()

    const empty = Set()

    return first.marks.withMutations(result => {
      chars.find(char => {
        const marks = char ? char.marks : empty
        result.intersect(marks)
        return result.size === 0
      })
    })
  }

  /**
   * Get a set of marks in a `position`, the equivalent of a collapsed range
   *
   * @param {string} key
   * @param {number} offset
   * @return {OrderedSet}
   */

  getMarksAtPosition(key, offset) {
    if (offset == 0) {
      const previous = this.getPreviousText(key)
      if (!previous || previous.text.length == 0) return OrderedSet()
      if (this.getClosestBlock(key) !== this.getClosestBlock(previous.key)) {
        return OrderedSet()
      }
      const char = previous.characters.last()
      if (!char) return OrderedSet()

      return new OrderedSet(char.marks)
    }

    const text = this.getDescendant(key)
    const char = text.characters.get(offset - 1)
    if (!char) return OrderedSet()
    return new OrderedSet(char.marks)
  }

  /**
   * Get all of the marks that match a `type`.
   *
   * @param {String} type
   * @return {Set<Mark>}
   */

  getMarksByType(type) {
    const array = this.getMarksByTypeAsArray(type)
    return new Set(array)
  }

  /**
   * Get all of the marks that match a `type`.
   *
   * @param {String} type
   * @return {OrderedSet<Mark>}
   */

  getOrderedMarksByType(type) {
    const array = this.getMarksByTypeAsArray(type)
    return new OrderedSet(array)
  }

  /**
   * Get all of the marks that match a `type` as an array.
   *
   * @param {String} type
   * @return {Array}
   */

  getMarksByTypeAsArray(type) {
    return this.nodes.reduce((array, node) => {
      return node.object == 'text'
        ? array.concat(node.getMarksAsArray().filter(m => m.type == type))
        : array.concat(node.getMarksByTypeAsArray(type))
    }, [])
  }

  /**
   * Get the block node before a descendant text node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getNextBlock(key) {
    const child = this.assertDescendant(key)
    let last

    if (child.object == 'block') {
      last = child.getLastText()
    } else {
      const block = this.getClosestBlock(key)
      last = block.getLastText()
    }

    const next = this.getNextText(last.key)
    if (!next) return null

    return this.getClosestBlock(next.key)
  }

  /**
   * Get the node after a descendant by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getNextSibling(key) {
    key = assertKey(key)

    const parent = this.getParent(key)
    const after = parent.nodes.skipUntil(child => child.key == key)

    if (after.size == 0) {
      throw new Error(`Could not find a child node with key "${key}".`)
    }
    return after.get(1)
  }

  /**
   * Get the text node after a descendant text node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getNextText(key) {
    key = assertKey(key)
    const texts = this.getTexts()
    const index = texts.findIndex(t => t.key === key)
    if (index === -1) return undefined
    return texts.get(index + 1)
  }

  /**
   * Get a node in the tree by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getNode(key) {
    key = assertKey(key)
    return this.key == key ? this : this.getDescendant(key)
  }

  /**
   * Get a node in the tree by `path`.
   *
   * @param {Array} path
   * @return {Node|Null}
   */

  getNodeAtPath(path) {
    return path.length ? this.getDescendantAtPath(path) : this
  }

  /**
   * Get the offset for a descendant text node by `key`.
   *
   * @param {String} key
   * @return {Number}
   */

  getOffset(key) {
    this.assertDescendant(key)

    // Calculate the offset of the nodes before the highest child.
    const child = this.getFurthestAncestor(key)
    const offset = this.nodes
      .takeUntil(n => n == child)
      .reduce((memo, n) => memo + n.text.length, 0)

    // Recurse if need be.
    return this.hasChild(key) ? offset : offset + child.getOffset(key)
  }

  /**
   * Get the offset from a `range`.
   *
   * @param {Range} range
   * @return {Number}
   */

  getOffsetAtRange(range) {
    range = range.normalize(this)

    if (range.isUnset) {
      throw new Error('The range cannot be unset to calculcate its offset.')
    }

    if (range.isExpanded) {
      throw new Error('The range must be collapsed to calculcate its offset.')
    }

    const { startKey, startOffset } = range
    return this.getOffset(startKey) + startOffset
  }

  /**
   * Get the parent of a child node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getParent(key) {
    if (!this.hasDescendant(key)) return null

    const str = this.getPathAsString(key)
    const path = str.split(' ').map(x => parseInt(x, 10))
    path.pop()
    return this.getDescendantAtPath(path)
  }

  /**
   * Get the path of a descendant node by `key`.
   *
   * @param {String|Node} key
   * @return {Array}
   */

  getPath(key) {
    if (!this.hasNode(key)) {
      throw new Error(`Could not find a node with key "${key}".`)
    }
    const path = this.getPathAsString(key)
    if (path.length === 0) {
      return []
    }
    return path.split(' ').map(x => parseInt(x, 10))
  }

  getPathAsString(key) {
    key = assertKey(key)
    if (this.key === key) return ''
    let result = null
    const index = this.nodes.findIndex(child => {
      if (child.key === key) {
        result = ''
        return true
      }
      if (child.object === 'text') {
        return false
      }
      result = child.getPathAsString(key)
      return typeof result === 'string'
    })
    if (index === -1) return null
    return result.length !== 0 ? `${index} ${result}` : `${index}`
  }

  /**
   * Refind the path of node if path is changed.
   *
   * @param {Array} path
   * @param {String} key
   * @return {Array}
   */

  refindPath(path, key) {
    const node = this.getDescendantAtPath(path)
    if (node && node.key === key) {
      return path
    }

    return this.getPath(key)
  }

  /**
   *
   * Refind the node with the same node.key after change.
   *
   * @param {Array} path
   * @param {String} key
   * @return {Node|Void}
   */

  refindNode(path, key) {
    const node = this.getDescendantAtPath(path)
    if (node && node.key === key) {
      return node
    }

    return this.getDescendant(key)
  }

  /**
   * Get the placeholder for the node from a `schema`.
   *
   * @param {Schema} schema
   * @return {Component|Void}
   */

  getPlaceholder(schema) {
    return schema.__getPlaceholder(this)
  }

  /**
   * Get the block node before a descendant text node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getPreviousBlock(key) {
    const child = this.assertDescendant(key)
    let first

    if (child.object == 'block') {
      first = child.getFirstText()
    } else {
      const block = this.getClosestBlock(key)
      first = block.getFirstText()
    }

    const previous = this.getPreviousText(first.key)
    if (!previous) return null

    return this.getClosestBlock(previous.key)
  }

  /**
   * Get the node before a descendant node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getPreviousSibling(key) {
    key = assertKey(key)
    const parent = this.getParent(key)
    const before = parent.nodes.takeUntil(child => child.key == key)

    if (before.size == parent.nodes.size) {
      throw new Error(`Could not find a child node with key "${key}".`)
    }

    return before.last()
  }

  /**
   * Get the text node before a descendant text node by `key`.
   *
   * @param {String} key
   * @return {Node|Null}
   */

  getPreviousText(key) {
    key = assertKey(key)
    const texts = this.getTexts()
    const index = texts.findIndex(t => t.key === key)
    return index > 0 ? texts.get(index - 1) : undefined
  }

  /**
   * Get the indexes of the selection for a `range`, given an extra flag for
   * whether the node `isSelected`, to determine whether not finding matches
   * means everything is selected or nothing is.
   *
   * @param {Range} range
   * @param {Boolean} isSelected
   * @return {Object|Null}
   */

  getSelectionIndexes(range, isSelected = false) {
    const { startKey, endKey } = range

    // PERF: if we're not selected, or the range is blurred, we can exit early.
    if (!isSelected || range.isBlurred) {
      return null
    }

    // if we've been given an invalid selection we can exit early.
    if (range.isUnset) {
      return null
    }

    // PERF: if the start and end keys are the same, just check for the child
    // that contains that single key.
    if (startKey == endKey) {
      const child = this.getFurthestAncestor(startKey)
      const index = child ? this.nodes.indexOf(child) : null
      return { start: index, end: index + 1 }
    }

    // Otherwise, check all of the children...
    let start = null
    let end = null

    this.nodes.forEach((child, i) => {
      if (child.object == 'text') {
        if (start == null && child.key == startKey) start = i
        if (end == null && child.key == endKey) end = i + 1
      } else {
        if (start == null && child.hasDescendant(startKey)) start = i
        if (end == null && child.hasDescendant(endKey)) end = i + 1
      }

      // PERF: exit early if both start and end have been found.
      return start == null || end == null
    })

    if (isSelected && start == null) start = 0
    if (isSelected && end == null) end = this.nodes.size
    return start == null ? null : { start, end }
  }

  /**
   * Get the concatenated text string of all child nodes.
   *
   * @return {String}
   */

  getText() {
    return this.nodes.reduce((string, node) => {
      return string + node.text
    }, '')
  }

  /**
   * Get the descendent text node at an `offset`.
   *
   * @param {String} offset
   * @return {Node|Null}
   */

  getTextAtOffset(offset) {
    // PERF: Add a few shortcuts for the obvious cases.
    if (offset == 0) return this.getFirstText()
    if (offset == this.text.length) return this.getLastText()
    if (offset < 0 || offset > this.text.length) return null

    let length = 0

    return this.getTexts().find((node, i, nodes) => {
      length += node.text.length
      return length > offset
    })
  }

  /**
   * Get the direction of the node's text.
   *
   * @return {String}
   */

  getTextDirection() {
    const dir = direction(this.text)
    return dir == 'neutral' ? undefined : dir
  }

  /**
   * Recursively get all of the child text nodes in order of appearance.
   *
   * @return {List<Node>}
   */

  getTexts() {
    const array = this.getTextsAsArray()
    return new List(array)
  }

  /**
   * Recursively get all the leaf text nodes in order of appearance, as array.
   *
   * @return {List<Node>}
   */

  getTextsAsArray() {
    let array = []
    const result = [array]
    this.nodes.forEach(node => {
      if (node.object === 'text') {
        array.push(node)
        return
      }
      array = []
      result.push(node.getTextsAsArray(), array)
    })
    if (result.length === 1) return result[0]
    return Array.prototype.concat.apply([], result)
  }

  /**
   * Get all of the text nodes in a `range`.
   *
   * @param {Range} range
   * @return {List<Node>}
   */

  getTextsAtRange(range) {
    const array = this.getTextsAtRangeAsArray(range)
    return new List(array)
  }

  /**
   * Get all of the text nodes in a `range` as an array.
   *
   * @param {Range} range
   * @return {Array}
   */

  getTextsAtRangeAsArray(range) {
    range = range.normalize(this)
    if (range.isUnset) return []
    const { startKey, endKey } = range
    return this.getTextsBetweenPositionsAsArray(startKey, endKey)
  }

  /**
   * Get all of the text nodes in a `range` as an array.
   *
   * @param {Range} range
   * @returns {Array}
   */

  getTextsBetweenPositionsAsArray(startKey, endKey) {
    const startText = this.getDescendant(startKey)

    // PERF: the most common case is when the range is in a single text node,
    // where we can avoid a lot of iterating of the tree.
    if (startKey == endKey) return [startText]

    const endText = this.getDescendant(endKey)
    const texts = this.getTextsAsArray()
    const start = texts.indexOf(startText)
    const end = texts.indexOf(endText, start)
    return texts.slice(start, end + 1)
  }

  /**
   * Check if a child node exists by `key`.
   *
   * @param {String} key
   * @return {Boolean}
   */

  hasChild(key) {
    return !!this.getChild(key)
  }

  /**
   * Check if a node has block node children.
   *
   * @param {String} key
   * @return {Boolean}
   */

  hasBlocks(key) {
    const node = this.assertNode(key)
    return !!(node.nodes && node.nodes.find(n => n.object === 'block'))
  }

  /**
   * Check if a node has inline node children.
   *
   * @param {String} key
   * @return {Boolean}
   */

  hasInlines(key) {
    const node = this.assertNode(key)
    return !!(
      node.nodes && node.nodes.find(n => Inline.isInline(n) || Text.isText(n))
    )
  }

  /**
   * Recursively check if a child node exists by `key`.
   *
   * @param {String} key
   * @return {Boolean}
   */

  hasDescendant(key) {
    return this.key !== key && this.hasNode(key)
  }

  /**
   * Recursively check if a node exists by `key`.
   *
   * @param {String} key
   * @return {Boolean}
   */

  hasNode(key) {
    return typeof this.getPathAsString(key) === 'string'
  }

  /**
   * Check if a node has a void parent by `key`.
   *
   * @param {String} key
   * @return {Boolean}
   */

  hasVoidParent(key) {
    return !!this.getClosestVoid(key)
  }

  /**
   * Insert a `node` at `index`.
   *
   * @param {Number} index
   * @param {Node} node
   * @return {Node}
   */

  insertNode(index, node) {
    const keys = this.getKeysAsSet()
    if (keys.includes(node.key)) {
      node = node.regenerateKey()
    }

    if (node.object != 'text') {
      node = node.mapDescendants(desc => {
        if (keys.includes(desc.key)) {
          return desc.regenerateKey()
        }
        return desc
      })
    }

    const nodes = this.nodes.insert(index, node)
    return this.set('nodes', nodes)
  }

  /**
   * Check whether the node is in a `range`.
   *
   * @param {Range} range
   * @return {Boolean}
   */

  isInRange(range) {
    range = range.normalize(this)

    const node = this
    const { startKey, endKey, isCollapsed } = range

    // PERF: solve the most common cast where the start or end key are inside
    // the node, for collapsed selections.
    if (
      node.key == startKey ||
      node.key == endKey ||
      node.hasDescendant(startKey) ||
      node.hasDescendant(endKey)
    ) {
      return true
    }

    // PERF: if the selection is collapsed and the previous check didn't return
    // true, then it must be false.
    if (isCollapsed) {
      return false
    }

    // Otherwise, look through all of the leaf text nodes in the range, to see
    // if any of them are inside the node.
    const texts = node.getTextsAtRange(range)
    let memo = false

    texts.forEach(text => {
      if (node.hasDescendant(text.key)) memo = true
      return memo
    })

    return memo
  }

  /**
   * Check whether the node is a leaf block.
   *
   * @return {Boolean}
   */

  isLeafBlock() {
    return this.object == 'block' && this.nodes.every(n => n.object != 'block')
  }

  /**
   * Check whether the node is a leaf inline.
   *
   * @return {Boolean}
   */

  isLeafInline() {
    return (
      this.object == 'inline' && this.nodes.every(n => n.object != 'inline')
    )
  }

  /**
   * Merge a children node `first` with another children node `second`.
   * `first` and `second` will be concatenated in that order.
   * `first` and `second` must be two Nodes or two Text.
   *
   * @param {Node} first
   * @param {Node} second
   * @return {Node}
   */

  mergeNode(withIndex, index) {
    let node = this
    let one = node.nodes.get(withIndex)
    const two = node.nodes.get(index)

    if (one.object != two.object) {
      throw new Error(
        `Tried to merge two nodes of different objects: "${one.object}" and "${
          two.object
        }".`
      )
    }

    // If the nodes are text nodes, concatenate their characters together.
    if (one.object == 'text') {
      const characters = one.characters.concat(two.characters)
      one = one.set('characters', characters)
    } else {
      // Otherwise, concatenate their child nodes together.
      const nodes = one.nodes.concat(two.nodes)
      one = one.set('nodes', nodes)
    }

    node = node.removeNode(index)
    node = node.removeNode(withIndex)
    node = node.insertNode(withIndex, one)
    return node
  }

  /**
   * Map all child nodes, updating them in their parents. This method is
   * optimized to not return a new node if no changes are made.
   *
   * @param {Function} iterator
   * @return {Node}
   */

  mapChildren(iterator) {
    let { nodes } = this

    nodes.forEach((node, i) => {
      const ret = iterator(node, i, this.nodes)
      if (ret != node) nodes = nodes.set(ret.key, ret)
    })

    return this.set('nodes', nodes)
  }

  /**
   * Map all descendant nodes, updating them in their parents. This method is
   * optimized to not return a new node if no changes are made.
   *
   * @param {Function} iterator
   * @return {Node}
   */

  mapDescendants(iterator) {
    let { nodes } = this

    nodes.forEach((node, index) => {
      let ret = node
      if (ret.object != 'text') ret = ret.mapDescendants(iterator)
      ret = iterator(ret, index, this.nodes)
      if (ret == node) return

      nodes = nodes.set(index, ret)
    })

    return this.set('nodes', nodes)
  }

  /**
   * Regenerate the node's key.
   *
   * @return {Node}
   */

  regenerateKey() {
    const key = generateKey()
    return this.set('key', key)
  }

  /**
   * Remove a `node` from the children node map.
   *
   * @param {String} key
   * @return {Node}
   */

  removeDescendant(key) {
    key = assertKey(key)

    let node = this
    let parent = node.getParent(key)
    if (!parent)
      throw new Error(`Could not find a descendant node with key "${key}".`)

    const index = parent.nodes.findIndex(n => n.key === key)
    const nodes = parent.nodes.splice(index, 1)

    parent = parent.set('nodes', nodes)
    node = node.updateNode(parent)
    return node
  }

  /**
   * Remove a node at `index`.
   *
   * @param {Number} index
   * @return {Node}
   */

  removeNode(index) {
    const nodes = this.nodes.splice(index, 1)
    return this.set('nodes', nodes)
  }

  /**
   * Split a child node by `index` at `position`.
   *
   * @param {Number} index
   * @param {Number} position
   * @return {Node}
   */

  splitNode(index, position) {
    let node = this
    const child = node.nodes.get(index)
    let one
    let two

    // If the child is a text node, the `position` refers to the text offset at
    // which to split it.
    if (child.object == 'text') {
      const befores = child.characters.take(position)
      const afters = child.characters.skip(position)
      one = child.set('characters', befores)
      two = child.set('characters', afters).regenerateKey()
    } else {
      // Otherwise, if the child is not a text node, the `position` refers to the
      // index at which to split its children.
      const befores = child.nodes.take(position)
      const afters = child.nodes.skip(position)
      one = child.set('nodes', befores)
      two = child.set('nodes', afters).regenerateKey()
    }

    // Remove the old node and insert the newly split children.
    node = node.removeNode(index)
    node = node.insertNode(index, two)
    node = node.insertNode(index, one)
    return node
  }

  /**
   * Set a new value for a child node by `key`.
   *
   * @param {Node} node
   * @return {Node}
   */

  updateNode(node) {
    if (node.key == this.key) {
      return node
    }

    let child = this.assertDescendant(node.key)
    const ancestors = this.getAncestors(node.key)

    ancestors.reverse().forEach(parent => {
      let { nodes } = parent
      const index = nodes.indexOf(child)
      child = parent
      nodes = nodes.set(index, node)
      parent = parent.set('nodes', nodes)
      node = parent
    })

    return node
  }

  /**
   * Validate the node against a `schema`.
   *
   * @param {Schema} schema
   * @return {Function|Null}
   */

  validate(schema) {
    return schema.validateNode(this)
  }

  /**
   * Get the first invalid descendant
   *
   * @param {Schema} schema
   * @return {Node|Text|Null}
   */

  getFirstInvalidDescendant(schema) {
    let result = null
    this.nodes.find(n => {
      result = n.validate(schema) ? n : n.getFirstInvalidDescendant(schema)
      return result
    })
    if (result) {
      this.getPathAsString(result.key)
    }
    return result
  }
}

/**
 * Assert a key `arg`.
 *
 * @param {String} arg
 * @return {String}
 */

function assertKey(arg) {
  if (typeof arg == 'string') return arg
  throw new Error(
    `Invalid \`key\` argument! It must be a key string, but you passed: ${arg}`
  )
}

/**
 * Memoize read methods.
 */

memoize(Node.prototype, [
  'areDescendantsSorted',
  'getAncestors',
  'getBlocks',
  'getBlocksBetweenPositions',
  'getBlocksByType',
  'getChild',
  'getClosestBlock',
  'getClosestInline',
  'getClosestVoid',
  'getCommonAncestor',
  'getDecorations',
  'getDepth',
  'getDescendant',
  'getDescendantAtPath',
  'getFirstText',
  'getFragmentBetweenPositions',
  'getFurthestBlock',
  'getFurthestInline',
  'getFurthestAncestor',
  'getFurthestOnlyChildAncestor',
  'getInlinesAsArray',
  'getInlinesBetweenPositions',
  'getInlinesByTypeAsArray',
  'getMarksAsArray',
  'getMarksAtPosition',
  'getMarksByTypeAsArray',
  'getOrderedMarksBetweenPositions',
  'getLastText',
  'getKeysAsSet',
  'getNextBlock',
  'getNextSibling',
  'getNextText',
  'getNode',
  'getNodeAtPath',
  'getOffset',
  'getParent',
  'getPath',
  'getPathAsString',
  'getPlaceholder',
  'getPreviousBlock',
  'getPreviousSibling',
  'getPreviousText',
  'getText',
  'getTextAtOffset',
  'getTextDirection',
  'getTextsAsArray',
  'getTextsBetweenPositionsAsArray',
  'isLeafBlock',
  'isLeafInline',
  'validate',
  'getFirstInvalidDescendant',
])

/**
 * Export.
 *
 * @type {Object}
 */

export default Node
