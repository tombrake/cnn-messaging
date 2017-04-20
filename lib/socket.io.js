'use strict';

const debug = require('debug')('cnn-messaging:socket.io');
const socketIo = require('socket.io');

function SocketIORelay(params) {
    if (!(this instanceof SocketIORelay)) {
        return new SocketIORelay(params);
    }
    params = params || {};
    this.io = socketIo(params.server);
    this.messenger = params.messenger;
    this.io.on('connection', (socket) => {
        debug(`socket ${socket.id} connected`);

        socket.on('subscribe', (topic) => {
            debug(`got subscribe request for ${topic}`);
            socket.join(topic);
            if (!this.observables[topic]) {
                this.messenger.createNotificationObservable(topic)
                    .then((o) => {
                        this.observables[topic] = o.subscribe((message) => {
                            debug('sending to socket.io', topic, message.toWS());
                            this.io.sockets.in(topic).emit(topic, message.toWS());
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
            this.subscriptions[topic][socket.id] = true;
        });

        socket.on('unsubscribe', (topic) => {
            socket.leave(topic);
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

        socket.on('disconnect', () => {
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

    this.observables = {};
    this.subscriptions = {};
}

module.exports = SocketIORelay;
