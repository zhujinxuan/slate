/** @jsx h */

import { createHyperscript } from '../..'

const h = createHyperscript({
  blocks: {
    paragraph: 'paragraph',
  },
  decorators: {
    highlight: 'highlight',
  },
})

export const input = (
  <value>
    <document>
      <block type="paragraph">
        This is a <highlight>paragraph with</highlight> a cursor position{' '}
        <cursor />(closed selection).
      </block>
    </document>
  </value>
)

export const output = {
  object: 'value',
  document: {
    object: 'document',
    data: {},
    nodes: [
      {
        object: 'block',
        type: 'paragraph',
        isVoid: false,
        data: {},
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                object: 'leaf',
                text:
                  'This is a paragraph with a cursor position (closed selection).',
                marks: [],
              },
            ],
          },
        ],
      },
    ],
  },
}

export const expectDecorations = [
  {
    anchorOffset: 10,
    focusOffset: 24,
    anchorKey: input.texts.get(0).key,
    focusKey: input.texts.get(0).key,
    marks: [
      {
        object: 'mark',
        type: 'highlight',
        data: {},
      },
    ],
  },
]
