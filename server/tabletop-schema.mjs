// Older Ollama grammar engines reject large string repetition bounds. Text length stays in the client parser.
const name = { type: 'string', minLength: 1 };
const id = { type: 'string', minLength: 1 };
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const position = {
  type: 'array', minItems: 3, maxItems: 3, additionalItems: false,
  items: [
    { type: 'number', minimum: -14, maximum: 14 },
    { type: 'number', minimum: 0, maximum: 30 },
    { type: 'number', minimum: -10, maximum: 10 },
  ],
};
const action = (type, properties, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false,
  properties: { type: { type: 'string', enum: [type] }, ...properties },
  required: ['type', ...required],
});

/** Server-owned schema only. Object references and state-dependent rules still need client validation. */
export const TABLETOP_RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    message: { type: 'string', minLength: 1 },
    actions: {
      type: 'array', maxItems: 16,
      items: {
        anyOf: [
          action('spawn', { kind: { type: 'string', enum: ['token', 'figurine', 'card', 'deck', 'board', 'block'] }, name, position, color }),
          action('spawn', { kind: { type: 'string', enum: ['dice'] }, name, position, color, sides: { type: 'integer', enum: [4, 6, 8, 10, 12, 20] } }, ['kind', 'name', 'position', 'color']),
          action('move', { id, position }),
          {
            ...action('update', {
              id, name, color, description: { type: 'string' },
              locked: { type: 'boolean' }, faceDown: { type: 'boolean' },
              value: { type: 'integer', minimum: 0, maximum: 1000000 },
            }, ['id']),
            minProperties: 3,
          },
          action('roll', { id }), action('shuffle', { id }), action('draw', { id }), action('remove', { id }),
        ],
      },
    },
  },
  required: ['message', 'actions'],
};
