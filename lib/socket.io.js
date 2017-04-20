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
            if (!this.observables[topic]) {
                this.messenger.createNotificationObservable(topic)
                    .then((o) => {
                        this.observables[topic] = o;
                        o.subscribe((message) => {
                            this.io.to(topic).emit(message);
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
            socket.join(topic);
        });

        socket.on('unsubscribe', (topic) => {
            socket.leave(topic);
            if (this.subscriptions[topic][socket.id]) {
                delete this.subscriptions[topic][socket.id];
                if (!Object.keys(this.subscriptions[topic]).length) {
                    delete this.subscriptions[topic];
                }
            }
            if (!this.subscriptions[topic]) {
                this.observables.unsubscribe();
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
                if (!this.subscriptions[topic]) {
                    this.observables.unsubscribe();
                    delete this.observables[topic];
                }
            });
        });
    });

    this.observables = {};
    this.subscriptions = {};
}

module.exports = SocketIORelay;
