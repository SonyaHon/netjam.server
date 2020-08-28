import { Request, response, Response } from 'express';
import { Socket } from 'socket.io';

export const NJ_PROVIDER_CONFIG = Symbol('nj-provider-config');
export const NJ_REMOTE_METHODS = Symbol('nj-remote-methods');
export const NJ_INIT_METHOD = Symbol('nj-init-method');
export const NJ_INJECTED_PARAMS = Symbol('nj-injected-params');
export const NJ_INJECTED_HANDLERS = Symbol('nj-injected-handlers');
export const NJ_AFTER_INIT_METHOD = Symbol('nj-after-init-method');

export enum ProviderType {
  REST,
  WS,
  REDIS,
}

export enum RemoteMethodType {
  GET,
  POST,
  MESSAGE,
  REMOTE_CALL,
  REDIS_MESSAGE,
  REDIS_CALL,
}

export interface ProviderOptions {
  prefix?: string;
  namespace?: string;
}

export function Provider(type: ProviderType, options?: ProviderOptions) {
  return function (constructor: any) {
    Reflect.defineMetadata(
      NJ_PROVIDER_CONFIG,
      {
        type,
        options,
      },
      constructor.prototype
    );
  };
}

export function Get(prefix: string = '/') {
  return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
    const prev = Reflect.getMetadata(NJ_REMOTE_METHODS, constructor) || [];
    Reflect.defineMetadata(
      NJ_REMOTE_METHODS,
      [
        ...prev,
        {
          type: RemoteMethodType.GET,
          originalName: name,
          prefix,
        },
      ],
      constructor
    );
  };
}

export function Post(prefix: string = '/') {
  return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
    const prev = Reflect.getMetadata(NJ_REMOTE_METHODS, constructor) || [];
    Reflect.defineMetadata(
      NJ_REMOTE_METHODS,
      [
        ...prev,
        {
          type: RemoteMethodType.POST,
          originalName: name,
          prefix,
        },
      ],
      constructor
    );
  };
}

export function Message(methodName?: string) {
  return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
    const prev = Reflect.getMetadata(NJ_REMOTE_METHODS, constructor) || [];
    Reflect.defineMetadata(
      NJ_REMOTE_METHODS,
      [
        ...prev,
        {
          type: RemoteMethodType.MESSAGE,
          originalName: name,
          remoteName: methodName,
        },
      ],
      constructor
    );
  };
}

export function RemoteCall(methodName?: string) {
  return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
    const prev = Reflect.getMetadata(NJ_REMOTE_METHODS, constructor) || [];
    Reflect.defineMetadata(
      NJ_REMOTE_METHODS,
      [
        ...prev,
        {
          type: RemoteMethodType.REMOTE_CALL,
          originalName: name,
          remoteName: methodName,
        },
      ],
      constructor
    );
  };
}

export function RedisMessage(eventName?: string) {
  return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
    const prev = Reflect.getMetadata(NJ_REMOTE_METHODS, constructor) || [];
    Reflect.defineMetadata(
      NJ_REMOTE_METHODS,
      [
        ...prev,
        {
          type: RemoteMethodType.REDIS_MESSAGE,
          originalName: name,
          remoteName: eventName,
        },
      ],
      constructor
    );
  };
}

export function Init(constructor: any, name: string, descriptor: PropertyDescriptor) {
  Reflect.defineMetadata(NJ_INIT_METHOD, name, constructor);
}

export function AfterStartInit(constructor: any, name: string, descriptor: PropertyDescriptor) {
  Reflect.defineMetadata(NJ_AFTER_INIT_METHOD, name, constructor);
}

export function injectRestParamDecoratorFactory(
  resolver: (request: Request, response: Response, ...args: any) => any
) {
  return function (...args) {
    return function (constructor: any, name: string, index: number) {
      const prev = Reflect.getMetadata(NJ_INJECTED_PARAMS, constructor, name) || [];
      Reflect.defineMetadata(
        NJ_INJECTED_PARAMS,
        [
          ...prev,
          {
            index,
            resolver: (request: Request, response: Response) => {
              return resolver(request, response, ...args);
            },
          },
        ],
        constructor,
        name
      );
    };
  };
}

export const Body = injectRestParamDecoratorFactory((req, res) => req.body);
export const Query = injectRestParamDecoratorFactory((req, res) => req.query);
export const Req = injectRestParamDecoratorFactory((req, res) => req);
export const Res = injectRestParamDecoratorFactory((req, res) => res);

export function injectRequestRestHandlerFactory(
  handler: (request: Request, response: Response, next: Function, ...args: any) => void
) {
  return function (...args) {
    return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
      const prev = Reflect.getMetadata(NJ_INJECTED_HANDLERS, constructor, name) || [];
      Reflect.defineMetadata(
        NJ_INJECTED_HANDLERS,
        [
          ...prev,
          (request: Request, response: Response, next: Function) => {
            handler(request, response, next, ...args);
          },
        ],
        constructor,
        name
      );
    };
  };
}

export function injectWsParamDecoratorFactory(
  handler: (socket: Socket, data: any[], ...args: any) => any
) {
  return function (...args) {
    return function (constructor: any, name: string, index: number) {
      const prev = Reflect.getMetadata(NJ_INJECTED_PARAMS, constructor, name) || [];
      Reflect.defineMetadata(
        NJ_INJECTED_PARAMS,
        [
          ...prev,
          {
            index,
            resolver: (data: any, socket: Socket) => {
              return handler(socket, data, ...args);
            },
          },
        ],
        constructor,
        name
      );
    };
  };
}

export const Client = injectWsParamDecoratorFactory((socket) => socket);
export const Handshake = injectWsParamDecoratorFactory((socket) => socket.handshake);

export function injectWsMiddlewareFactory(
  handler: (
    data: any[],
    socket: Socket,
    next: { continue: (newData: any[]) => void; break: () => void },
    ...args: any
  ) => void
) {
  return function (...args) {
    return function (constructor: any, name: string, descriptor: PropertyDescriptor) {
      const prev = Reflect.getMetadata(NJ_INJECTED_HANDLERS, constructor, name) || [];
      Reflect.defineMetadata(
        NJ_INJECTED_HANDLERS,
        [
          ...prev,
          (
            data: any[],
            socket: Socket,
            next: { continue: (newData: any[]) => void; break: () => void }
          ) => {
            handler(data, socket, next, ...args);
          },
        ],
        constructor,
        name
      );
    };
  };
}
