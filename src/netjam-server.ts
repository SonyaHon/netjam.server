import {EventEmitter} from "events";
import {createServer, Server as HttpServer} from 'http';
import Express, {Application} from 'express';
import Io, {Server as IoServer} from 'socket.io';
import {ProviderBase} from "./provider-base";
import {
    NJ_INIT_METHOD, NJ_INJECTED_HANDLERS,
    NJ_INJECTED_PARAMS,
    NJ_PROVIDER_CONFIG,
    NJ_REMOTE_METHODS,
    ProviderType,
    RemoteMethodType
} from "./decorators";
import bodyParser from "body-parser";


export interface NetjamServerConfig {
    server: {
        port: number,
        host: string
    },
}

export class NetjamServer extends EventEmitter {

    private readonly httpServer: HttpServer;
    public express: Application;
    private readonly io: IoServer;
    private globalPrefix: null | string = null;
    private providers: Object = {};

    constructor(private readonly config: NetjamServerConfig) {
        super();
        this.express = Express();
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({
            extended: true
        }));
        this.httpServer = createServer(this.express);

        this.io = Io(this.httpServer, {
            serveClient: false,
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
        const remoteMethods: { type: RemoteMethodType, originalName: string, prefix?: string }[] = Reflect.getMetadata(NJ_REMOTE_METHODS, provider) || [];

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
            this.express[httpReq](this.concatRestPrefixes(this.globalPrefix || '', options.prefix || '/', prefix || '/'), [...injectedHandlers, async (req, res) => {
                const injectedParams = Reflect.getMetadata(NJ_INJECTED_PARAMS, provider, originalName);
                let args = [];
                injectedParams.sort((a, b) => a.index - b.index).forEach(arg => {
                    args.push(arg.resolver(req, res));
                });
                const result = await provider[originalName](...args);
                res.json(result);
            }]);
        }
    }

    private prepareForWs(provider: ProviderBase) {

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
    }

    getProvider<T>(providerName: string): T | null {
        return this.providers[providerName] || null;
    }
}