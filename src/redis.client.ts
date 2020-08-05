import {EventEmitter}                       from 'events';
import redis, {RedisClient as TRedisClient} from 'redis';
import {v1 as uuid}                         from 'uuid';
import {RedisBusEvents, REventCodes}        from './redis_events/bus-globals';

export const NJ_RKEY_BUS = 'nj_bus';
export const NJ_RKEY_SERVICE = 'nj_service';
export const NJ_RKEY_DELIMETR = '::';

export class RedisClient extends EventEmitter {
    private readonly serviceName: string;
    private readonly ioClient: TRedisClient;
    private readonly busClient: TRedisClient;
    private id: string;

    private connectedServices: Object = {};

    constructor(options: { host: string, port: number, serviceName: string }) {
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
            await this.ioClient.set(`${NJ_RKEY_SERVICE}${NJ_RKEY_DELIMETR}${this.serviceName}${NJ_RKEY_DELIMETR}${this.id}`, JSON.stringify({
                healthStatus: 'good',
            }), 'PX', 15000);
        }, 10000);
    }

    async init() {
        await this.ioClient.set(`${NJ_RKEY_SERVICE}${NJ_RKEY_DELIMETR}${this.serviceName}${NJ_RKEY_DELIMETR}${this.id}`, JSON.stringify({
            healthStatus: 'good',
        }), 'PX', 15000);
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
        await this.updateConnectedServices();
    }

    private processGlobalBus(data: string) {
        try {
            const parsedData: { event: REventCodes } = JSON.parse(data);
            switch (parsedData.event) {
                case REventCodes.SERVICE_CONNECTED:
                case REventCodes.SERVICE_DISCONNECTED:
                    this.updateConnectedServices();
                    break;
            }
        } catch (e) {

        }
    }

    private processSelfBus(data: string) {
        data = JSON.parse(data);
    }

    private async updateConnectedServices() {
        const keys = await this.ioClient.scan('0', 'MATCH', `${NJ_RKEY_SERVICE}${NJ_RKEY_DELIMETR}*`, 'COUNT', '100', (err, data) => {
            console.log(data);
        });
        console.log(keys);
    }
}