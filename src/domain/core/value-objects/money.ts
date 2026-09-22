export class Money {
  amountCents: number;
  currency: string;

  constructor(amountCents: number, currency = 'BRL') {
    if (!Number.isInteger(amountCents)) {
      throw new Error('Money must be an integer of cents');
    }

    if (amountCents < 0) {
      throw new Error('Money cannot be negative');
    }

    this.amountCents = amountCents;
    this.currency = currency;
  }

  times(quantity: number): Money {
    return new Money(this.amountCents * quantity, this.currency);
  }
}
