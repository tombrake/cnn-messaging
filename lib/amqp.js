'use strict';

const amqplib = require('amqplib');
const debug = require('debug')('cnn-messaging:amqp');
const util = require('util');
const Messenger = require('./messenger');
const Message = require('./message');
const Rx = require('rxjs');

function AmqpMessenger(params) {
    if (!(this instanceof AmqpMessenger)) {
        return new AmqpMessenger(params);
    }
    Messenger.call(this);
    this.params = params.amqp;
    if (!this.params.connectionString || !this.params.exchangeName) {
        throw new Error('Not properly paramsured for AMQP. See the README.');
    }
    this.subscriptions = {
        notification: {},
        work: {}
    };
}

util.inherits(AmqpMessenger, Messenger);

AmqpMessenger.prototype.start = function start() {
    return Messenger.prototype.start.call(this)
        .then(() => {
            return amqplib.connect(this.params.connectionString);
        })
        .then((conn) => {
            this.connection = conn;
            debug('created connection');
            return Promise.all([conn.createChannel(), conn.createChannel()]);
        }, (err) => {
            return Promise.reject(err);
        })
        .then((channels) => {
            this.channel = {
                private: channels[0],
                work: channels[1]
            };
            this.channel.work.prefetch(1, true);
            debug('created channels');
            return this.channel.private.assertExchange(this.params.exchangeName, 'topic', {durable: true});
        })
        .then(() => {
            debug('exchange is ready');
            this.state = this.states[2];
            return Promise.resolve();
        });
};

AmqpMessenger.prototype.stop = function stop() {
    return Messenger.prototype.stop.call(this)
        .then(() => {
            return this.connection.close();
        })
        .then(() => {
            this.state = this.states[0];
            return Promise.resolve();
        });
};

AmqpMessenger.prototype.publish = function publish(topic, message) {
    return Messenger.prototype.publish.call(this, topic, message)
        .then(() => {
            return new Promise((resolve, reject) => {
                if (this.channel.private.publish(this.params.exchangeName, topic, message.toAmqp())) {
                    debug('amqp sent message');
                    return resolve();
                }
                return reject(new Error('Publish failure. Queue may be full.'));
            });
        });
};

AmqpMessenger.prototype.createNotificationObservable = function createNotificationObservable(topic) {
    // assert a private queue into existance and then bind it to the topic
    return Messenger.prototype.createNotificationObservable.call(this, topic)
        .then(() => {
            if (this.subscriptions.notification[topic]) {
                return Promise.reject(new Error('Already subscribed to that topic.'));
            }
            const queueparams = {
                durable: false,
                exclusive: true
            };
            return this.channel.private.assertQueue('', queueparams);
        })
        .then((q) => {
            this.subscriptions.notification[topic] = q.queue;
            return this.channel.private.bindQueue(q.queue, this.params.exchangeName, topic);
        })
        .then(() => {
            debug(`created notification subscription to topic: ${topic}, queue: ${this.subscriptions.notification[topic]}`);
            let consTag;
            return new Rx.Observable.create((observer) => {
                this.channel.private.consume(this.subscriptions.notification[topic], (msg) => {
                    observer.next(Message.fromAmqp(msg, this.channel.notification));
                }, {noAck: true})
                .then((res) => {
                    consTag = res.consumerTag;
                });
                return () => {
                    debug(`stop consuming from ${topic}`);
                    // unbind the private queue from the topic to stop routing at the amqp server
                    this.channel.private.unbindQueue(this.subscriptions.notification[topic], this.params.exchangeName, topic);
                    this.channel.private.cancel(consTag);
                    debug(`stopped receiving new messages from ${topic}`);
                    delete this.subscriptions.notification[topic];
                };
            });
        });
};

AmqpMessenger.prototype.createWorkObservable = function createWorkObservable(topic, queue) {
    // assert a private queue into existance and then bind it to the topic
    return Messenger.prototype.createWorkObservable.call(this, topic, queue)
        .then(() => {
            if (this.subscriptions.work[topic]) {
                return Promise.reject(new Error('Already subscribed to that topic.'));
            }
            const queueparams = {
                durable: true,
                exclusive: false
            };
            return this.channel.work.assertQueue(queue, queueparams);
        })
        .then((q) => {
            this.subscriptions.work[topic] = q.queue;
            return this.channel.work.bindQueue(q.queue, this.params.exchangeName, topic);
        })
        .then(() => {
            debug(`created work subscription to topic: ${topic}, queue: ${this.subscriptions.work[topic]}`);
            let consTag;
            return new Rx.Observable.create((observer) => {
                this.channel.work.consume(this.subscriptions.work[topic], (msg) => {
                    observer.next(Message.fromAmqp(msg, this.channel.work));
                }, {noAck: false})
                .then((res) => {
                    consTag = res.consumerTag;
                });
                return () => {
                    debug(`stop consuming from ${topic} on ${consTag}`);
                    // do NOT unbind the work queue from the topic
                    this.channel.work.cancel(consTag);
                    debug(`stopped receiving new messages from ${topic}`);
                    delete this.subscriptions.work[topic];
                };
            });
        });
};

module.exports = AmqpMessenger;
