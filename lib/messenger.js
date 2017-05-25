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

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

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
    start() {
        var _this = this;

        return _asyncToGenerator(function* () {
            return new Promise(function (resolve, reject) {
                if (_this.state !== _this.states[0]) {
                    return reject(new Error(`Cannot start when in state: ${_this.state}`));
                }
                _this.state = _this.states[1];
                debug('starting');

                _this.state = _this.states[2];
                debug('started');

                resolve();
            });
        })();
    }

    /**
    stop the service
    */
    stop() {
        var _this2 = this;

        return _asyncToGenerator(function* () {
            return new Promise(function (resolve, reject) {
                if (_this2.state !== _this2.states[2]) {
                    return reject(new Error(`Cannot stop when in state: ${_this2.state}`));
                }
                _this2.state = _this2.states[3];
                debug('stopping');

                _this2.state = _this2.states[0];
                debug('stopped');

                resolve();
            });
        })();
    }

    /**
    publish a message to a topic
    */
    publish(topic, message) {
        return _asyncToGenerator(function* () {
            debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
            if (!(message instanceof _message2.default)) {
                return Promise.reject(new Error('provided message is not an instance of Message'));
            }
            return Promise.resolve();
        })();
    }

    /**
    create an observable for a given topic, that is meant for multiple recipients per message
    */
    createNotificationObservable(topic) {
        return _asyncToGenerator(function* () {
            debug(`creating observable for topic: ${topic}`);
            return Promise.resolve(new _rxjs2.default.Subject());
        })();
    }

    /**
    create an observable for a given topic, that is meant for a single recipient per message
    */
    createWorkObservable(topic, sharedQueue) {
        return _asyncToGenerator(function* () {
            debug(`creating observable for: ${sharedQueue} to topic: ${topic}`);
            return Promise.resolve(new _rxjs2.default.Subject());
        })();
    }
}
exports.default = Messenger;
module.exports = exports['default'];