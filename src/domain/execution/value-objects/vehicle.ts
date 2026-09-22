export interface VehicleProps {
  id: string;
  plate: string;
  model?: string;
}

export class Vehicle {
  id: string;
  plate: string;
  model?: string;

  constructor({ id, plate, model }: VehicleProps) {
    if (!id.trim()) {
      throw new Error('Vehicle requires an id');
    }

    if (!plate.trim()) {
      throw new Error('Vehicle requires a plate');
    }

    this.id = id;
    this.plate = plate.trim().toUpperCase();
    this.model = model;
  }
}
