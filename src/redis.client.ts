import { EventEmitter } from 'events';
import redis, { RedisClient as TRedisClient } from 'redis';
import { v1 as uuid } from 'uuid';
import { RedisBusEvents, REventCodes } from './redis-events/bus-globals';
import { RCLIENT_EVENTS } from './redis-events/redist-client-events';

export const NJ_RKEY_BUS = 'nj_bus';
export const NJ_RKEY_SERVICE = 'nj_service';
export const NJ_RKEY_DELIMETR = '::';

export class RedisClient extends EventEmitter {
  readonly serviceName: string;
  readonly ioClient: TRedisClient;
  readonly busClient: TRedisClient;
  readonly id: string;

  private startUpTime: number;
  private healthMiddlewares: (() => { [key: string]: string | number })[] = [];

  constructor(options: { host: string; port: number; serviceName: string }) {
    super();
    this.serviceName = options.serviceName;
    this.id = uuid();
    this.ioClient = redis.createClient({
      host: options.host,
      port: options.port,
    });
    this.busClient = redis.createClient({
      host: options.host,
      port: options.port,
    });
  }

  pingLoop() {
    setInterval(async () => {
      console.log(this.healthMiddlewares.map((mw) => mw()));
      await this.ioClient.set(
        `${NJ_RKEY_SERVICE}${NJ_RKEY_DELIMETR}${this.serviceName}${NJ_RKEY_DELIMETR}${this.id}`,
        JSON.stringify({
          uptime: Date.now() - this.startUpTime,
          ...this.healthMiddlewares.map((mw) => mw()).reduce((res, el) => ({ ...res, ...el }), {}),
        }),
        'PX',
        15000
      );
    }, 10000);
  }

  async init() {
    this.startUpTime = Date.now();
    await this.ioClient.set(
      `${NJ_RKEY_SERVICE}${NJ_RKEY_DELIMETR}${this.serviceName}${NJ_RKEY_DELIMETR}${this.id}`,
      JSON.stringify({
        uptime: Date.now() - this.startUpTime,
        ...this.healthMiddlewares.map((mw) => mw()),
      }),
      'PX',
      15000
    );
    this.pingLoop();

    this.busClient.subscribe(NJ_RKEY_BUS, `${NJ_RKEY_BUS}::${this.serviceName}`);
    this.busClient.on('message', (ch, data) => {
      if (ch === NJ_RKEY_BUS) {
        this.processGlobalBus(data);
      } else {
        this.processSelfBus(data);
      }
    });

    this.ioClient.publish(NJ_RKEY_BUS, RedisBusEvents.Connect(uuid()));
  }

  useMetricMiddleware(middleware: () => { [key: string]: string | number }) {
    this.healthMiddlewares.push(middleware);
  }

  private async checkIfIdIsBeingProcseed(id: string) {
    return new Promise((resolve, reject) => {
      this.ioClient.get(id, (err, reply) => {
        console.log('Ch2', err, reply);

        if (err) {
          reject(err);
          return;
        }
        resolve(!!reply);
      });
    });
  }

  private async claimId(id: string) {
    return new Promise((resolve, reject) => {
      this.ioClient.set(id, this.id, (err, reply) => {
        if (err) {
          reject(err);

          return;
        }
        resolve();
      });
    });
  }

  private async unclaimId(id: string) {
    await new Promise((resolve, reject) => {
      this.ioClient.del(id, (err, reply) => {
        console.log('Ch4', err, reply);

        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private async processGlobalBus(data: string) {
    try {
      const parsedEvent: { id: string; data: { event: REventCodes } } = JSON.parse(data);
      switch (parsedEvent.data.event) {
        case REventCodes.SERVICE_CONNECTED:
        case REventCodes.SERVICE_DISCONNECTED:
          // maybe add something to it
          // default - no action for not to make services binded together
          // basically a service do not need to now if another one even exists
          // this one will know somthing only if some call will be bad
          break;
        case REventCodes.MESSAGE:
          const dt: {
            id: string;
            data: {
              event: REventCodes;
              serviceName: string;
              eventName: string;
              data: any;
            };
          } = JSON.parse(data);
          // check if this message is addressed to self
          console.log('Ch1', this.serviceName, dt.data.serviceName);
          if (this.serviceName !== dt.data.serviceName) return;
          // check if this message in not being processed by another service
          if (await this.checkIfIdIsBeingProcseed(dt.id)) return;
          // claim this message to self
          await this.claimId(dt.id);
          // pass this to the right provider

          this.emit(RCLIENT_EVENTS.MESSAGE, {
            eventName: dt.data.eventName,
            data: dt.data.data,
          });
          // remove message from redis
          await this.unclaimId(dt.id);
          break;
        case REventCodes.CALL:
          // check if this call is not being processed by another service
          // claim this call to self
          // pass this call to the right provider
          // send results back
          break;
        case REventCodes.CALL_RETURN:
          // fire an event that the call has been resolved
          // remove call from redis
          break;
      }
    } catch (e) {}
  }

  private processSelfBus(data: string) {
    data = JSON.parse(data);
    return data;
  }
}
