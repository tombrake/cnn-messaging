// @flow

import events from 'events';
import WebSocket from 'uws';
import Messenger from './messenger';
import Debug from 'debug';
const debug = Debug('cnn-messaging:messenger:websocket');

/**
A performant websocket relay for messenger
*/
export default class WebsocketRelay extends events.EventEmitter {
    io: WebSocket.Server;
    messenger: Messenger;
    connectionCount: number;
    connections: number;
    observables: Object;
    subscriptions: Object;
    pingInterval: number;
    pingService: number;
    /**
    create a new instance of websocket relay
    */
    constructor(params: {messenger: Messenger, port?: number, http?: any, pingInterval: number}) {
        super();
        params = params || {};
        if (!params.messenger || (!params.port && !params.http)) {
            throw new Error('You must provide an instance of a messenger and a port for web socket server');
        }
        if (params.port) {
            this.io = new WebSocket.Server({
                perMessageDeflate: false,
                port: params.port
            });
        }
        if (params.http) {
            this.io = new WebSocket.Server({
                perMessageDeflate: false,
                server: params.http
            });
        }

        this.messenger = params.messenger;
        this.messenger.websocketRelay = this;
        this.connectionCount = 0;
        this.connections = 0;
        this.observables = {};
        this.subscriptions = {};
        this.pingInterval = params.pingInterval;

        this.io.on('connection', (socket) => {
            this.handleSocketConnection(socket);
        });

        this.pingService = setInterval(() => {
            this.sendPing();
        }, this.pingInterval);
        // $FlowFixMe (flow does not understand the next line)
        this.pingService.unref(); // allows graceful shutdown
    }

    sendPing(): void {
        const startTime = new Date();
        this.io.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping('', false, true);
        });
        const endTime = new Date();
        this.emit('pingComplete', {
            connections: this.connections,
            duration: endTime - startTime
        });
    }

    handleSocketConnection(socket: Object): void {
        this.connectionCount++;
        this.connections++;

        socket.id = this.connectionCount;
        debug(`socket ${socket.id} connected`);

        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });

        socket.on('message', (msg) => {
            this.handleSocketMessage(socket, msg);
        });

        socket.on('close', () => {
            this.handleSocketClose(socket);
        });
    }

    handleSocketMessage(socket: Object, msg: string): void {
        let request;
        try {
            request = JSON.parse(msg);
        } catch (e) {
            debug(`Error parsing request ${msg}`);
            return;
        }

        switch (request.action) {
            case 'subscribe':
                this.subscribe(request.topic, socket);
                break;
            case 'unsubscribe':
                this.unsubscribe(request.topic, socket.id);
                break;
            default:
                debug(`Got unknown request action: ${request.action}`);
        }
    }

    subscribe(topic: string, socket: Object): void {
        debug(`got subscribe request for ${topic}`);
        if (!this.observables[topic]) {
            this.messenger.createNotificationObservable(topic)
                .then((o) => {
                    this.observables[topic] = o.subscribe((message) => {
                        this.relay(topic, message.toWS());
                    }, (err) => {
                        debug(err);
                    }, () => {
                        debug('observable ended');
                    });
                });
        }
        if (!this.subscriptions[topic]) {
            this.subscriptions[topic] = {};
        }
        this.subscriptions[topic][socket.id] = socket;
    }

    unsubscribe(topic: string, socketId: string): void {
        if (this.subscriptions[topic][socketId]) {
            delete this.subscriptions[topic][socketId];
            if (!Object.keys(this.subscriptions[topic]).length) {
                delete this.subscriptions[topic];
            }
        }
        if (!this.subscriptions[topic] && this.observables[topic]) {
            debug(`closing observable for ${topic}`);
            this.observables[topic].unsubscribe();
            delete this.observables[topic];
        }
    }

    handleSocketClose(socket: Object): void {
        this.connections--;
        debug(`socket ${socket.id} disconnected`);
        Object.keys(this.subscriptions).forEach((topic) => {
            this.unsubscribe(topic, socket.id);
        });
    }

    relay(topic: string, msg: string): void {
        const startTime = new Date();
        let subscribers = 0;
        if (this.subscriptions[topic]) {
            Object.keys(this.subscriptions[topic]).forEach((socketId) => {
                const socket = this.subscriptions[topic][socketId];
                debug('sending to websocket', socketId, topic, msg);
                socket.send(msg);
                subscribers++;
            });
        }
        const endTime = new Date();
        this.emit('relayComplete', {
            topic,
            subscribers,
            duration: endTime - startTime
        });
    }
}
