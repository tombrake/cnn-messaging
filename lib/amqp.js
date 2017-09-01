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
    async start() {
        if (this.state !== this.states[0]) {
            return Promise.reject(new Error(`Cannot start when in state: ${this.state}`));
        }
        this.state = this.states[1];
        debug('starting');

        const conn = await _amqplib2.default.connect(this.params.connectionString);
        this.connection = conn;
        debug('created connection');

        this.channel = {
            notification: await conn.createChannel(),
            work: await conn.createChannel()
        };
        this.channel.work.prefetch(1, true);
        debug('created channels');

        await this.channel.notification.assertExchange(this.params.exchangeName, 'topic', { durable: true });
        this.state = this.states[2];
        debug('started');

        return Promise.resolve();
    }

    /**
    stop the service
    */
    async stop() {
        if (this.state !== this.states[2]) {
            return Promise.reject(new Error(`Cannot stop when in state: ${this.state}`));
        }
        this.state = this.states[3];
        debug('stopping');

        await this.channel.work.close();
        await this.channel.notification.close();
        debug('closed channels');

        await this.connection.close();
        debug('closed connection');

        this.state = this.states[0];
        debug('stopped');

        return Promise.resolve();
    }

    /**
    publish a message to a topic
    */
    async publish(topic, message) {
        debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
        if (!(message instanceof _message2.default)) {
            return Promise.reject(new Error('provided message is not an instance of Message'));
        }

        return new Promise((resolve, reject) => {
            if (this.channel.notification.publish(this.params.exchangeName, topic, message.toAmqp())) {
                debug('amqp sent message');
                return resolve();
            }
            return reject(new Error('Publish failure. Queue may be full.'));
        });
    }

    /**
    create an observable for a given topic, type, and queue
    */
    async _createObservable(topic, type, queue) {
        if (this.observables[type][topic]) {
            return this.observables[type][topic];
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
        const q = await this.channel[type].assertQueue(queue, queueparams);
        this.subscriptions[type][topic] = q.queue;
        await this.channel[type].bindQueue(q.queue, this.params.exchangeName, topic);
        debug(`created ${type} subscription to topic: ${topic}, queue: ${this.subscriptions[type][topic]}`);
        let consTag;
        this.observables[type][topic] = new _rxjs2.default.Observable.create(observer => {
            // start consuming from the amqp queue
            this.channel[type].consume(this.subscriptions[type][topic], msg => {
                observer.next(_message2.default.fromAmqp(msg, this.channel[type]));
            }, { noAck }).then(res => {
                consTag = res.consumerTag;
            });

            // return the function that handles unsubscribe here
            return () => {
                debug(`stop ${type} subscription to ${topic}, queue: ${this.subscriptions[type][topic]}`);
                if (type !== 'work') {
                    // unbind the queue from the topic to stop routing at the amqp server
                    this.channel[type].unbindQueue(this.subscriptions[type][topic], this.params.exchangeName, topic);
                    debug(`unbound queue ${this.subscriptions[type][topic]} to topic ${topic}`);
                }
                // stop consuming from the queue
                this.channel[type].cancel(consTag);
                debug(`stopped receiving new ${type} messages from ${topic}`);
                if (type !== 'work') {
                    // delete queue
                    debug(`deleting queue ${this.subscriptions[type][topic]}`);
                    this.channel[type].deleteQueue(this.subscriptions[type][topic]);
                }
                delete this.subscriptions[type][topic];
                delete this.observables[type][topic];
            };
        });
        return this.observables[type][topic];
    }

    /**
    create an observable for a given topic, that is meant for multiple recipients per message
    */
    async createNotificationObservable(topic) {
        return this._createObservable(topic, 'notification', '');
    }

    /**
    create an observable for a given topic, that is meant for a single recipient per message
    */
    async createWorkObservable(topic, queue) {
        return this._createObservable(topic, 'work', queue);
    }
}
exports.default = AmqpMessenger;
module.exports = exports['default'];