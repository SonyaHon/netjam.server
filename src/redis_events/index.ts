export enum EREventType {
    MESSAGE,
    CALL
}

export interface IREvent {
    id: string,
    type: EREventType,
    data: any
}

export class REventMessage implements IREvent {
    type: EREventType;

    constructor(public readonly id: string, public readonly data: any) {
        this.type = EREventType.MESSAGE;
    }

    toJSON() {
        return JSON.stringify({
            id  : this.id,
            type: this.type,
            data: this.data,
        });
    }
}