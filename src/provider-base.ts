import {NetjamServer} from "./netjam-server";

export class ProviderBase {
    protected netjam: NetjamServer = null;

    _set_natjam(netjamServer: NetjamServer) {
        this.netjam = netjamServer;
    }

    getProvider<T>(providerName: string): T | null {
        return this.netjam.getProvider<T>(providerName);
    }
}