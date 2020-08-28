import { ProviderBase } from '../provider-base';
import { RedisClient, NJ_RKEY_BUS } from '../redis.client';
import { RedisBusEvents } from '../redis-events/bus-globals';
import { v4 as uuid } from 'uuid';
import { AfterStartInit } from '../decorators';

export class MicroserviceConnectProvider extends ProviderBase {
  private r: RedisClient;

  constructor() {
    super();
  }

  message(toService: string, event: string, data?: any) {
    console.log(toService, event, data);

    this.r.ioClient.publish(NJ_RKEY_BUS, RedisBusEvents.Message(uuid(), toService, event, data));
  }

  call(toService: string, event: string, data: any) {}

  broadcast(event: string, data: any) {}

  @AfterStartInit
  afterStartInit() {
    this.r = this.netjam.getRedisClient();
  }
}

export const MICROSERVICE_CONNECT = MicroserviceConnectProvider.name;
