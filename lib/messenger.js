'use strict';

const debug = require('debug')('cnn-messaging');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const Rx = require('rxjs');
const Message = require('./message');

function Messenger(config) {
    if (!(this instanceof Messenger)) {
        return new Messenger(config);
    }
    EventEmitter.call(this);
    config = config || {};
    this.states = {
        0: 'STOPPED',
        1: 'STARTING',
        2: 'STARTED',
        3: 'STOPPING',
        4: 'ERROR'
    };
    this.state = this.states[0];
}

util.inherits(Messenger, EventEmitter);

Messenger.prototype.start = function start() {
    if (this.state !== this.states[0]) {
        return Promise.reject(new Error(`Cannot start when in state: ${this.state}`));
    }
    this.state = this.states[1];
    debug('starting');
    return Promise.resolve();
};

Messenger.prototype.stop = function stop() {
    if (this.state !== this.states[2]) {
        return Promise.reject(new Error(`Cannot stop when in state: ${this.state}`));
    }
    this.state = this.states[3];
    debug('stopping');
    return Promise.resolve();
};

Messenger.prototype.publish = function publish(topic, message) {
    debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
    if (!(message instanceof Message)) {
        return Promise.reject(new Error('provided message is not an instance of Message'));
    }
    return Promise.resolve();
};

Messenger.prototype.createNotificationObservable = function createNotificationObservable(topic) {
    debug(`creating observable for topic: ${topic}`);
    return Promise.resolve(new Rx.Subject());
};

Messenger.prototype.createWorkObservable = function createWorkObservable(topic, sharedQueue) {
    debug(`creating observable for: ${sharedQueue} to topic: ${topic}`);
    return Promise.resolve(new Rx.Subject());
};

module.exports = Messenger;
