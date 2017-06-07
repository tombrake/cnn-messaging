'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _amqplib = require('amqplib');

var _amqplib2 = _interopRequireDefault(_amqplib);

var _messenger = require('./messenger');

var _messenger2 = _interopRequireDefault(_messenger);

var _message = require('./message');

var _message2 = _interopRequireDefault(_message);

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const debug = (0, _debug2.default)('cnn-messaging:messenger:amqp');

/**
A messenger that can use amqp topic exchanges and queues
*/
class AmqpMessenger extends _messenger2.default {

    /**
    Create a new amqp messenger instance
    */
    constructor(params) {
        super(params);
        this.params = params.amqp;
        if (!this.params.connectionString || !this.params.exchangeName) {
            throw new Error('Not properly configured for AMQP. See the README.');
        }
    }

    /**
    start the service
    */
    start() {
        var _this = this;

        return _asyncToGenerator(function* () {
            if (_this.state !== _this.states[0]) {
                return Promise.reject(new Error(`Cannot start when in state: ${_this.state}`));
            }
            _this.state = _this.states[1];
            debug('starting');

            const conn = yield _amqplib2.default.connect(_this.params.connectionString);
            _this.connection = conn;
            debug('created connection');

            _this.channel = {
                notification: yield conn.createChannel(),
                work: yield conn.createChannel()
            };
            _this.channel.work.prefetch(1, true);
            debug('created channels');

            yield _this.channel.notification.assertExchange(_this.params.exchangeName, 'topic', { durable: true });
            _this.state = _this.states[2];
            debug('started');

            return Promise.resolve();
        })();
    }

    /**
    stop the service
    */
    stop() {
        var _this2 = this;

        return _asyncToGenerator(function* () {
            if (_this2.state !== _this2.states[2]) {
                return Promise.reject(new Error(`Cannot stop when in state: ${_this2.state}`));
            }
            _this2.state = _this2.states[3];
            debug('stopping');

            yield _this2.channel.work.close();
            yield _this2.channel.notification.close();
            debug('closed channels');

            yield _this2.connection.close();
            debug('closed connection');

            _this2.state = _this2.states[0];
            debug('stopped');

            return Promise.resolve();
        })();
    }

    /**
    publish a message to a topic
    */
    publish(topic, message) {
        var _this3 = this;

        return _asyncToGenerator(function* () {
            debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
            if (!(message instanceof _message2.default)) {
                return Promise.reject(new Error('provided message is not an instance of Message'));
            }

            return new Promise(function (resolve, reject) {
                if (_this3.channel.notification.publish(_this3.params.exchangeName, topic, message.toAmqp())) {
                    debug('amqp sent message');
                    return resolve();
                }
                return reject(new Error('Publish failure. Queue may be full.'));
            });
        })();
    }

    /**
    create an observable for a given topic, type, and queue
    */
    _createObservable(topic, type, queue) {
        var _this4 = this;

        return _asyncToGenerator(function* () {
            if (_this4.observables[type][topic]) {
                return _this4.observables[type][topic];
            }
            debug(`creating ${type} observable for topic: ${topic}`);
            let queueparams = {
                durable: false,
                exclusive: true
            };
            let noAck = true;
            if (type === 'work') {
                queueparams = {
                    durable: true,
                    exclusive: false
                };
                noAck = false;
            }
            debug('creating', type, 'queue with params:', queueparams, 'noAck:', noAck);
            const q = yield _this4.channel[type].assertQueue(queue, queueparams);
            _this4.subscriptions[type][topic] = q.queue;
            yield _this4.channel[type].bindQueue(q.queue, _this4.params.exchangeName, topic);
            debug(`created ${type} subscription to topic: ${topic}, queue: ${_this4.subscriptions[type][topic]}`);
            let consTag;
            _this4.observables[type][topic] = new _rxjs2.default.Observable.create(function (observer) {
                // start consuming from the amqp queue
                _this4.channel[type].consume(_this4.subscriptions[type][topic], function (msg) {
                    observer.next(_message2.default.fromAmqp(msg, _this4.channel[type]));
                }, { noAck }).then(function (res) {
                    consTag = res.consumerTag;
                });

                // return the function that handles unsubscribe here
                return function () {
                    debug(`stop ${type} subscription to ${topic}, queue: ${_this4.subscriptions[type][topic]}`);
                    if (type !== 'work') {
                        // unbind the queue from the topic to stop routing at the amqp server
                        _this4.channel[type].unbindQueue(_this4.subscriptions[type][topic], _this4.params.exchangeName, topic);
                        debug(`unbound queue ${_this4.subscriptions[type][topic]} to topic ${topic}`);
                    }
                    // stop consuming from the queue
                    _this4.channel[type].cancel(consTag);
                    debug(`stopped receiving new ${type} messages from ${topic}`);
                    if (type !== 'work') {
                        // delete queue
                        debug(`deleting queue ${_this4.subscriptions[type][topic]}`);
                        _this4.channel[type].deleteQueue(_this4.subscriptions[type][topic]);
                    }
                    delete _this4.subscriptions[type][topic];
                    delete _this4.observables[type][topic];
                };
            });
            return _this4.observables[type][topic];
        })();
    }

    /**
    create an observable for a given topic, that is meant for multiple recipients per message
    */
    createNotificationObservable(topic) {
        var _this5 = this;

        return _asyncToGenerator(function* () {
            return _this5._createObservable(topic, 'notification', '');
        })();
    }

    /**
    create an observable for a given topic, that is meant for a single recipient per message
    */
    createWorkObservable(topic, queue) {
        var _this6 = this;

        return _asyncToGenerator(function* () {
            return _this6._createObservable(topic, 'work', queue);
        })();
    }
}
exports.default = AmqpMessenger;
module.exports = exports['default'];