import { describe, expect, it } from 'bun:test';
import { Vehicle } from './vehicle';

describe('Vehicle', () => {
  it('keeps the snapshot that came with the command', () => {
    const vehicle = new Vehicle({
      id: 'vehicle-1',
      plate: 'ABC1D23',
      model: 'Gol 1.6',
    });

    expect(vehicle.id).toBe('vehicle-1');
    expect(vehicle.plate).toBe('ABC1D23');
    expect(vehicle.model).toBe('Gol 1.6');
  });

  it('normalizes the plate', () => {
    expect(new Vehicle({ id: 'vehicle-1', plate: ' abc1d23 ' }).plate).toBe(
      'ABC1D23',
    );
  });

  it('accepts a vehicle without model', () => {
    expect(
      new Vehicle({ id: 'vehicle-1', plate: 'ABC1D23' }).model,
    ).toBeUndefined();
  });

  it('rejects a vehicle without id', () => {
    expect(() => new Vehicle({ id: ' ', plate: 'ABC1D23' })).toThrow(
      'Vehicle requires an id',
    );
  });

  it('rejects a vehicle without plate', () => {
    expect(() => new Vehicle({ id: 'vehicle-1', plate: '' })).toThrow(
      'Vehicle requires a plate',
    );
  });
});
