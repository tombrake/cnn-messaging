'use strict';

const amqplib = require('amqplib');
const debug = require('debug')('cnn-messaging:amqp');
const util = require('util');
const Messenger = require('./messenger');
const Message = require('./message');

function AmqpClient(config) {
    if (!(this instanceof AmqpClient)) {
        return new AmqpClient(config);
    }
    Messenger.call(this);
    this.config = config.amqp;
    if (!this.config.connectionString || !this.config.exchangeName) {
        throw new Error('Not properly configured for AMQP. See the README.');
    }
    this.subscriptions = {
        notification: {},
        work: {}
    };
}

util.inherits(AmqpClient, Messenger);

AmqpClient.prototype.start = function start() {
    return Messenger.prototype.start.call(this)
        .then(() => {
            return amqplib.connect(this.config.connectionString);
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
            return this.channel.private.assertExchange(this.config.exchangeName, 'topic', {durable: true});
        })
        .then(() => {
            debug('exchange is ready');
            this.state = this.states[2];
            return Promise.resolve();
        });
};

AmqpClient.prototype.stop = function stop() {
    return Messenger.prototype.stop.call(this)
        .then(() => {
            return this.connection.close();
        })
        .then(() => {
            this.state = this.states[0];
            return Promise.resolve();
        });
};

AmqpClient.prototype.publish = function publish(topic, message) {
    return Messenger.prototype.publish.call(this, topic, message)
        .then(() => {
            return new Promise((resolve, reject) => {
                if (this.channel.private.publish(this.config.exchangeName, topic, message.toAmqp())) {
                    return resolve();
                }
                return reject(new Error('Publish failure. Queue may be full.'));
            });
        });
};

AmqpClient.prototype.createNotificationObservable = function createNotificationObservable(topic) {
    // assert a private queue into existance and then bind it to the topic
    let observable;
    return Messenger.prototype.createNotificationObservable.call(this, topic)
        .then((o) => {
            observable = o;
            if (this.subscriptions.notification[topic]) {
                return Promise.reject(new Error('Already subscribed to that topic.'));
            }
            const queueConfig = {
                durable: false,
                exclusive: true
            };
            return this.channel.private.assertQueue('', queueConfig);
        })
        .then((q) => {
            this.subscriptions.notification[topic] = q.queue;
            return this.channel.private.bindQueue(q.queue, this.config.exchangeName, topic);
        })
        .then(() => {
            debug(`created notification subscription to topic: ${topic}, queue: ${this.subscriptions.notification[topic]}`);
            return this.channel.private.consume(this.subscriptions.notification[topic], (msg) => {
                const message = Message.fromAmqp(msg);
                observable.next(message);
            }, {noAck: true});
        })
        .then(() => {
            return observable;
        });
};

AmqpClient.prototype.createWorkObservable = function createWorkObservable(topic, queue) {
    // assert a private queue into existance and then bind it to the topic
    let observable;
    return Messenger.prototype.createWorkObservable.call(this, topic, queue)
        .then((o) => {
            observable = o;
            if (this.subscriptions.work[topic]) {
                return Promise.reject(new Error('Already subscribed to that topic.'));
            }
            const queueConfig = {
                durable: true,
                exclusive: false
            };
            return this.channel.work.assertQueue(queue, queueConfig);
        })
        .then((q) => {
            this.subscriptions.work[topic] = q.queue;
            return this.channel.work.bindQueue(q.queue, this.config.exchangeName, topic);
        })
        .then(() => {
            debug(`created work subscription to topic: ${topic}, queue: ${this.subscriptions.notification[topic]}`);
            return this.channel.work.consume(this.subscriptions.work[topic], (msg) => {
                observable.next(Message.fromAmqp(msg));
            }, {noAck: false});
        })
        .then(() => {
            return observable;
        });
};

module.exports = AmqpClient;
