import { describe, expect, it } from 'bun:test';
import { Entity } from './entity';

class Sample extends Entity {}

describe('Entity', () => {
  it('generates an id when none is given', () => {
    expect(new Sample().id).toBeString();
  });

  it('keeps the id it was given', () => {
    expect(new Sample('an-id').id).toBe('an-id');
  });

  it('is equal to itself', () => {
    const entity = new Sample();

    expect(entity.equals(entity)).toBe(true);
  });

  it('is equal to another entity with the same id', () => {
    expect(new Sample('an-id').equals(new Sample('an-id'))).toBe(true);
  });

  it('is not equal to an entity with another id', () => {
    expect(new Sample('an-id').equals(new Sample('other-id'))).toBe(false);
  });
});
