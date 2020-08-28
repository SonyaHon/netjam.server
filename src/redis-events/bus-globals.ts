import { REventMessage } from './index';

export enum REventCodes {
  SERVICE_CONNECTED,
  SERVICE_DISCONNECTED,
  MESSAGE,
  CALL,
  CALL_RETURN,
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

  static Message(id: string, serviceName: string, eventName: string, data?: any) {
    return new REventMessage(id, {
      event: REventCodes.MESSAGE,
      serviceName,
      eventName,
      data,
    }).toJSON();
  }
}
