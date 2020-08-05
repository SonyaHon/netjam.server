import {EventEmitter}                               from 'events';
import {createServer, Server as HttpServer}         from 'http';
import Express, {Application}                       from 'express';
import Io, {Server as IoServer, Socket as IoSocket} from 'socket.io';
import {ProviderBase}                               from './provider-base';
import {
    NJ_INIT_METHOD, NJ_INJECTED_HANDLERS,
    NJ_INJECTED_PARAMS,
    NJ_PROVIDER_CONFIG,
    NJ_REMOTE_METHODS,
    ProviderType,
    RemoteMethodType,
}                                                   from './decorators';
import bodyParser                                   from 'body-parser';
import {RedisClient}                                from './redis.client';
import _                                            from 'lodash';

export interface NetjamServerConfig {
    server: {
        port: number,
        host: string
    },
    microservice?: {
        serviceName: string,
        redisConnection: {
            host: string,
            port: number
        },
    }
}

export class NetjamServer extends EventEmitter {

    private readonly httpServer: HttpServer;
    public express: Application;
    private readonly io: IoServer;
    private socketEventsTree: {
        message: {
            [event: string]: Function
        },
        remoteCall: {
            [event: string]: Function
        }
    } = {
        message   : {},
        remoteCall: {},
    };
    private globalPrefix: null | string = null;
    private providers: Object = {};
    private redisClient?: RedisClient = null;

    constructor(private readonly config: NetjamServerConfig) {
        super();
        this.express = Express();
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({
            extended: true,
        }));
        this.httpServer = createServer(this.express);

        this.io = Io(this.httpServer, {
            serveClient: false,
        });

        this.io.on('connection', (socket: IoSocket) => {
            this.prepareSocket(socket);
        });
    }

    useGlobalRestApiPrefix(prefix: string) {
        this.globalPrefix = prefix;
    }

    private concatRestPrefixes(...args: string[]) {
        let res = args.join('/');
        res = res.replace(/\/{2,}/g, '/');
        if (res[res.length - 1] === '/') {
            res = res.substr(0, res.length - 1);
        }
        return res;
    }

    private prepareForRest(provider: ProviderBase) {
        const {options} = Reflect.getMetadata(NJ_PROVIDER_CONFIG, provider);
        const remoteMethods: { type: RemoteMethodType, originalName: string, prefix?: string }[] = Reflect.getMetadata(NJ_REMOTE_METHODS, provider) ||
                                                                                                   [];

        for (let method of remoteMethods) {
            const {type, originalName, prefix} = method;

            let httpReq;
            switch (type) {
                case RemoteMethodType.GET:
                    httpReq = 'get';
                    break;
                case RemoteMethodType.POST:
                    httpReq = 'post';
                    break;
            }

            const injectedHandlers = Reflect.getMetadata(NJ_INJECTED_HANDLERS, provider, originalName) || [];
            this.express[httpReq](this.concatRestPrefixes(this.globalPrefix || '', options.prefix || '/', prefix ||
                                                                                                          '/'), [
                ...injectedHandlers, async (req, res) => {
                    const injectedParams = Reflect.getMetadata(NJ_INJECTED_PARAMS, provider, originalName);
                    let args = [];
                    injectedParams.sort((a, b) => a.index - b.index).forEach(arg => {
                        args.push(arg.resolver(req, res));
                    });
                    const result = await provider[originalName](...args);
                    res.json(result);
                },
            ]);
        }
    }

    private prepareForWs(provider: ProviderBase) {
        const {options} = Reflect.getMetadata(NJ_PROVIDER_CONFIG, provider);
        const remoteMethods: { type: RemoteMethodType, originalName: string, remoteName?: string }[] = Reflect.getMetadata(NJ_REMOTE_METHODS, provider) ||
                                                                                                       [];

        for (let method of remoteMethods) {
            const {type, originalName, remoteName} = method;
            const eventName = remoteName ? remoteName : originalName;
            const namespace = options.namespace || 'default';
            const handlerEvent = `${namespace}::${eventName}`;

            switch (type) {
                case RemoteMethodType.MESSAGE:
                    if (this.socketEventsTree.message[handlerEvent]) {
                        throw new Error(`Cannot bind more than one handler for the event: Provider namespace: "${namespace}", method: "${eventName}"`);
                    }

                    this.socketEventsTree.message[handlerEvent] = async (data: any[], socket: IoSocket) => {
                        const middlewares = Reflect.getMetadata(NJ_INJECTED_HANDLERS, provider, originalName) || [];
                        let stop = false;
                        const next = {
                            continue: (newData?: any[]): void => {
                                if (newData) data = newData;
                            },
                            break   : (): void => {
                                stop = true;
                            },
                        };
                        for (let mw of middlewares) {
                            await mw(data, socket, next);
                            if (stop) return;
                        }
                        const str = provider[originalName].toString();
                        const args = /\(\s*([^)]+?)\s*\)/.exec(str);
                        const fArgs = [];
                        if (!args[1]) await provider[originalName]();
                        const fArgsLen = args[1].split(',').length;
                        const injectedParams = Reflect.getMetadata(NJ_INJECTED_PARAMS, provider, originalName) || [];
                        _.times(fArgsLen, i => {
                            let injected = injectedParams.find(el => el.index === i);
                            if (!injected) {
                                fArgs.push(data.shift());
                            } else {
                                fArgs.push(injected.resolver(data, socket));
                            }
                        });
                        await provider[originalName](...fArgs);
                    };
                    break;
                case RemoteMethodType.REMOTE_CALL:
                    if (this.socketEventsTree.remoteCall[handlerEvent]) {
                        throw new Error(`Cannot bind more than one handler for the event: Provider namespace: "${namespace}", method: "${eventName}"`);
                    }

                    this.socketEventsTree.remoteCall[handlerEvent] = async (data: any[], socket: IoSocket) => {
                        const middlewares = Reflect.getMetadata(NJ_INJECTED_HANDLERS, provider, originalName) || [];
                        let stop = false;
                        let optReturnValue = undefined;
                        const next = {
                            continue: (newData: any[]): void => {
                                if (newData) data = newData;
                            },
                            break   : (returnValue: any = undefined): void => {
                                optReturnValue = returnValue;
                                stop = true;
                            },
                        };
                        for (let mw of middlewares) {
                            await mw(data, socket, next);
                            if (stop) return optReturnValue;
                        }
                        const str = provider[originalName].toString();
                        const args = /\(\s*([^)]+?)\s*\)/.exec(str);
                        const fArgs = [];
                        if (!args[1]) await provider[originalName]();
                        const fArgsLen = args[1].split(',').length;
                        const injectedParams = Reflect.getMetadata(NJ_INJECTED_PARAMS, provider, originalName) || [];
                        _.times(fArgsLen, i => {
                            let injected = injectedParams.find(el => el.index === i);
                            if (!injected) {
                                fArgs.push(data.shift());
                            } else {
                                fArgs.push(injected.resolver(data, socket));
                            }
                        });
                        return await provider[originalName](...fArgs);
                    };
                    break;
            }


        }
    }

    async bootstrap(providers: ProviderBase[]) {
        const initStack = [];
        for (let provider of providers) {
            this.providers[provider.constructor.name] = provider;
            provider._set_natjam(this);
            const {type} = Reflect.getMetadata(NJ_PROVIDER_CONFIG, provider);
            switch (type) {
                case ProviderType.REST:
                    this.prepareForRest(provider);
                    break;
                case ProviderType.WS:
                    this.prepareForWs(provider);
                    break;
            }
            const initMethod = Reflect.getMetadata(NJ_INIT_METHOD, provider);
            if (initMethod) {
                initStack.push({
                    provider,
                    initMethod,
                });
            }
        }

        for (let exp of initStack) {
            await exp.provider[exp.initMethod]();
        }
    }

    async start() {
        await new Promise(resolve => {
            this.httpServer.listen(this.config.server.port, this.config.server.host, resolve);
        });
        if (this.config.microservice) {
            this.redisClient = new RedisClient({
                host       : this.config.microservice.redisConnection.host,
                port       : this.config.microservice.redisConnection.port,
                serviceName: this.config.microservice.serviceName,
            });
            await this.redisClient.init();
        }
    }

    getProvider<T>(providerName: string): T | null {
        return this.providers[providerName] || null;
    }

    private prepareSocket(socket: IoSocket) {
        _.forEach(this.socketEventsTree.message, (callback: Function, eventName: string) => {
            socket.on(eventName, async (data: any) => {
                await callback(data, socket);
            });
        });

        _.forEach(this.socketEventsTree.remoteCall, async (callback: Function, eventName: string) => {
            socket.on(eventName, async (data: any, ret: Function) => {
                const res = await callback(data, socket);
                ret(res);
            });
        });
    }
}