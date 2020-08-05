import {EventEmitter}                       from 'events';
import redis, {RedisClient as TRedisClient} from 'redis';

export const RKEY_SERVICES = 'services';

export class RedisClient extends EventEmitter {
    private readonly serviceName: string;
    private readonly ioClient: TRedisClient;

    private connectedServices: Object = {};

    constructor(options: { host: string, port: number, serviceName: string }) {
        super();
        this.serviceName = options.serviceName;
        this.ioClient = redis.createClient({
            host: options.host,
            port: options.port,
        });
    }

    async init() {
        await this.ioClient.hset(RKEY_SERVICES, this.serviceName, JSON.stringify({
            name: this.serviceName,
        }));
    }
}