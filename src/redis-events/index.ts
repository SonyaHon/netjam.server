export interface IREvent {
  id: string;
  data: any;
}

export class REventMessage implements IREvent {
  constructor(public readonly id: string, public readonly data: any) {}

  toJSON() {
    return JSON.stringify({
      id: this.id,
      data: this.data,
    });
  }
}
