import { describe, it, expectTypeOf } from 'vitest';
import type { ParsedRequest, MessageData, Env } from '../src/types';

describe('types', () => {
  it('ParsedRequest has required fields', () => {
    expectTypeOf<ParsedRequest>().toHaveProperty('contentType');
    expectTypeOf<ParsedRequest>().toHaveProperty('flags');
    expectTypeOf<ParsedRequest['flags']>().toHaveProperty('forceMosaic');
  });

  it('MessageData has images array', () => {
    expectTypeOf<MessageData>().toHaveProperty('images');
  });
});
