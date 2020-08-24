import { EventEmitter } from 'events';
import redis, { RedisClient as TRedisClient } from 'redis';
import { v1 as uuid } from 'uuid';
import { RedisBusEvents, REventCodes } from './redis-events/bus-globals';

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

  private processGlobalBus(data: string) {
    try {
      const parsedData: { event: REventCodes } = JSON.parse(data);
      switch (parsedData.event) {
        case REventCodes.SERVICE_CONNECTED:
        case REventCodes.SERVICE_DISCONNECTED:
          // maybe add something to it
          // default - no action for not to make services binded together
          // basically a service do not need to now if another one even exists
          // this one will know somthing only if some call will be bad
          break;
      }
    } catch (e) {}
  }

  private processSelfBus(data: string) {
    data = JSON.parse(data);
    return data;
  }
}
