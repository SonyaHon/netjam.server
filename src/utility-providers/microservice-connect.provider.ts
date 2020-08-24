import { ProviderBase } from '../provider-base';

export class MicroserviceConnectProvider extends ProviderBase {
  message(toService: string, event: string, data: any) {}

  call(toService: string, event: string, data: any) {}

  broadcast(event: string, data: any) {}
}

export const MICROSERVICE_CONNECT = MicroserviceConnectProvider.name;
