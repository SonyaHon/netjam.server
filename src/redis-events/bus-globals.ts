import { REventMessage } from './index';

export enum REventCodes {
  SERVICE_CONNECTED,
  SERVICE_DISCONNECTED,
}

export class RedisBusEvents {
  static Connect(id: string) {
    return new REventMessage(id, {
      event: REventCodes.SERVICE_CONNECTED,
    }).toJSON();
  }

  static Disconnect(id: string) {
    return new REventMessage(id, {
      event: REventCodes.SERVICE_DISCONNECTED,
    }).toJSON();
  }
}
