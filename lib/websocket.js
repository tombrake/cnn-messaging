'use strict';

const debug = require('debug')('cnn-messaging:websocket');
const WebSocket = require('uws');

function WebsocketRelay(params) {
    if (!(this instanceof WebsocketRelay)) {
        return new WebsocketRelay(params);
    }
    params = params || {};
    if (!params.messenger || !params.port) {
        throw new Error('You must provide an instance of a messenger and a port for web socket server');
    }
    this.io = new WebSocket.Server({
        perMessageDeflate: false,
        port: params.port
    });
    this.messenger = params.messenger;
    this.messenger.websocketRelay = this;
    this.connectionCount = 0;

    this.io.on('connection', (socket) => {
        socket.id = this.connectionCount;
        this.connectionCount++;
        debug(`socket ${socket.id} connected`);

        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });

        socket.on('message', (msg) => {
            let request;
            try {
                request = JSON.parse(msg);
            } catch (e) {
                debug(`Error parsing request ${msg}`);
                return;
            }

            debug(`Got message ${msg}`);

            switch (request.action) {
                case 'subscribe':
                    debug(`got subscribe request for ${request.topic}`);
                    if (!this.observables[request.topic]) {
                        this.messenger.createNotificationObservable(request.topic)
                            .then((o) => {
                                this.observables[request.topic] = o.subscribe((message) => {
                                    this.sendToTopic(request.topic, message.toWS());
                                }, (err) => {
                                    debug(err);
                                }, () => {
                                    debug('observable ended');
                                });
                            });
                    }
                    if (!this.subscriptions[request.topic]) {
                        this.subscriptions[request.topic] = {};
                    }
                    this.subscriptions[request.topic][socket.id] = socket;
                    break;
                case 'unsubscribe':
                    if (this.subscriptions[request.topic][socket.id]) {
                        delete this.subscriptions[request.topic][socket.id];
                        if (!Object.keys(this.subscriptions[request.topic]).length) {
                            delete this.subscriptions[request.topic];
                        }
                    }
                    if (!this.subscriptions[request.topic] && this.observables[request.topic]) {
                        debug(`closing observable for ${request.topic}`);
                        this.observables[request.topic].unsubscribe();
                        delete this.observables[request.topic];
                    }
                    break;
                default:
                    debug(`Got unknown request action: ${request.action}`);
            }
        });

        socket.on('close', () => {
            debug(`socket ${socket.id} disconnected`);
            Object.keys(this.subscriptions).forEach((topic) => {
                if (this.subscriptions[topic][socket.id]) {
                    delete this.subscriptions[topic][socket.id];
                    if (!Object.keys(this.subscriptions[topic]).length) {
                        delete this.subscriptions[topic];
                    }
                }
                if (!this.subscriptions[topic] && this.observables[topic]) {
                    debug(`closing observable for ${topic}`);
                    this.observables[topic].unsubscribe();
                    delete this.observables[topic];
                }
            });
        });
    });

    const interval = setInterval(() => {
        this.io.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping('', false, true);
        });
    }, 30000);
    interval.unref();

    this.observables = {};
    this.subscriptions = {};
}

WebsocketRelay.prototype.sendToTopic = function sendToTopic(topic, msg) {
    Object.keys(this.subscriptions[topic]).forEach((socketId) => {
        const socket = this.subscriptions[topic][socketId];
        debug('sending to websocket', socketId, topic, msg);
        socket.send(msg);
    });
};

module.exports = WebsocketRelay;
