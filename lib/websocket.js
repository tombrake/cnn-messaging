'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _messenger = require('./messenger');

var _messenger2 = _interopRequireDefault(_messenger);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const debug = (0, _debug2.default)('cnn-messaging:messenger:websocket');

let WebSocket;
let uwsEnabled = false;

try {
    WebSocket = require('uws');
    uwsEnabled = true;
} catch (e) {
    debug(`uws module not available. ${e}. Disabling...`);
}

/**
A performant websocket relay for messenger
*/
class WebsocketRelay extends _events2.default.EventEmitter {
    /**
    create a new instance of websocket relay
    */
    constructor(params) {
        super();
        params = params || {};
        if (!params.messenger || !params.port && !params.http) {
            throw new Error('You must provide an instance of a messenger and a port for web socket server');
        }
        if (params.port && uwsEnabled) {
            this.io = new WebSocket.Server({
                perMessageDeflate: false,
                port: params.port
            });
        }
        if (params.http && uwsEnabled) {
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

        this.io && this.io.on('connection', socket => {
            this.handleSocketConnection(socket);
        });

        this.pingService = setInterval(() => {
            this.sendPing();
        }, this.pingInterval);
        // $FlowFixMe (flow does not understand the next line)
        this.pingService.unref(); // allows graceful shutdown
    }

    sendPing() {
        const startTime = new Date();
        this.io && this.io.clients.forEach(ws => {
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

    handleSocketConnection(socket) {
        this.connectionCount++;
        this.connections++;

        socket.id = this.connectionCount;
        debug(`socket ${socket.id} connected`);

        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });

        socket.on('message', msg => {
            this.handleSocketMessage(socket, msg);
        });

        socket.on('close', () => {
            this.handleSocketClose(socket);
        });
    }

    handleSocketMessage(socket, msg) {
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

    subscribe(topic, socket) {
        debug(`got subscribe request for ${topic}`);
        if (!this.observables[topic]) {
            this.messenger.createNotificationObservable(topic).then(o => {
                this.observables[topic] = o.subscribe(message => {
                    this.relay(topic, message.toWS());
                }, err => {
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

    unsubscribe(topic, socketId) {
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

    handleSocketClose(socket) {
        this.connections--;
        debug(`socket ${socket.id} disconnected`);
        Object.keys(this.subscriptions).forEach(topic => {
            this.unsubscribe(topic, socket.id);
        });
    }

    relay(topic, msg) {
        const startTime = new Date();
        let subscribers = 0;
        if (this.subscriptions[topic]) {
            Object.keys(this.subscriptions[topic]).forEach(socketId => {
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
exports.default = WebsocketRelay;
module.exports = exports['default'];