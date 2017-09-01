'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _message = require('./message');

var _message2 = _interopRequireDefault(_message);

var _websocket = require('./websocket');

var _websocket2 = _interopRequireDefault(_websocket);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const debug = (0, _debug2.default)('cnn-messaging:messenger');

/**
An in-memory messenger, providing pub/sub like features
*/


class Messenger extends _events2.default.EventEmitter {

    /**
    Create a new messenger instance
    */
    constructor(params) {
        super();
        params = params || {};
        this.states = ['STOPPED', 'STARTING', 'STARTED', 'STOPPING', 'ERROR'];
        this.state = this.states[0];
        this.subscriptions = {
            notification: {},
            work: {}
        };
        this.observables = {
            notification: {},
            work: {}
        };
        if (params.port) {
            const interval = process.env.PINGINTERVAL && parseInt(process.env.PINGINTERVAL) || 30000;
            debug('got port, creating websocket relay with ping interval', interval);
            this.websocketRelay = new _websocket2.default({
                port: params.port,
                messenger: this,
                pingInterval: interval
            });
        }
        if (params.http) {
            const interval = process.env.PINGINTERVAL && parseInt(process.env.PINGINTERVAL) || 30000;
            debug('got http server, creating websocket relay with ping interval', interval);
            this.websocketRelay = new _websocket2.default({
                http: params.http,
                messenger: this,
                pingInterval: interval
            });
        }
    }

    /**
    start the service
    */
    async start() {
        return new Promise((resolve, reject) => {
            if (this.state !== this.states[0]) {
                return reject(new Error(`Cannot start when in state: ${this.state}`));
            }
            this.state = this.states[1];
            debug('starting');

            this.state = this.states[2];
            debug('started');

            resolve();
        });
    }

    /**
    stop the service
    */
    async stop() {
        return new Promise((resolve, reject) => {
            if (this.state !== this.states[2]) {
                return reject(new Error(`Cannot stop when in state: ${this.state}`));
            }
            this.state = this.states[3];
            debug('stopping');

            this.state = this.states[0];
            debug('stopped');

            resolve();
        });
    }

    /**
    publish a message to a topic
    */
    async publish(topic, message) {
        debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
        if (!(message instanceof _message2.default)) {
            return Promise.reject(new Error('provided message is not an instance of Message'));
        }
        return Promise.resolve();
    }

    /**
    create an observable for a given topic, that is meant for multiple recipients per message
    */
    async createNotificationObservable(topic) {
        debug(`creating observable for topic: ${topic}`);
        return Promise.resolve(new _rxjs2.default.Subject());
    }

    /**
    create an observable for a given topic, that is meant for a single recipient per message
    */
    async createWorkObservable(topic, sharedQueue) {
        debug(`creating observable for: ${sharedQueue} to topic: ${topic}`);
        return Promise.resolve(new _rxjs2.default.Subject());
    }
}
exports.default = Messenger;
module.exports = exports['default'];