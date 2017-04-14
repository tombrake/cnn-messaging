'use strict';

const kafka = require('no-kafka');
const debug = require('debug')('cnn-messaging:kafka');
const util = require('util');
const Messenger = require('./messenger');
const Message = require('./message');
const uuidV1 = require('uuid/v1');
const _ = require('lodash');

function KafkaClient(config) {
    if (!(this instanceof KafkaClient)) {
        return new KafkaClient(config);
    }
    Messenger.call(this);
    this.config = config.kafka;
    if (!this.config.connectionString) {
        throw new Error('Not properly configured for Kafka. See the README.');
    }
    this.subscriptions = {
        notification: {},
        work: {}
    };
}

util.inherits(KafkaClient, Messenger);

KafkaClient.prototype.start = function start() {
    return Messenger.prototype.start.call(this)
        .then(() => {
            debug(`connecting to ${this.config.connectionString}`);
            const Producer = kafka.Producer;
            this.producer = new Producer(this.config);
            return this.producer.init();
        })
        .then(() => {
            this.state = this.states[2];
            debug('connected');
            return Promise.resolve();
        }, (err) => {
            this.state = this.states[4];
            return Promise.reject(err);
        });
};

KafkaClient.prototype.stop = function stop() {
    return Messenger.prototype.stop.call(this)
        .then(() => {
            debug(`disconnecting from ${this.config.connectionString}`);
            return this.producer.end()
                .then(() => {
                    this.state = this.states[0];
                    debug('disconnected');
                    return Promise.resolve();
                }, (err) => {
                    this.state = this.states[4];
                    return Promise.reject(err);
                });
        });
};

KafkaClient.prototype.publish = function publish(topic, message) {
    return Messenger.prototype.publish.call(this, topic, message)
        .then(() => {
            return this.producer.send({
                topic,
                partition: 0,
                message: {
                    value: message.toKafka()
                }
            });
        });
};

KafkaClient.prototype.createNotificationObservable = function createNotificationObservable(topic) {
    // create a private consumer group
    let observable;
    const groupId = `private-${uuidV1()}`; //create a private groupId
    return Messenger.prototype.createNotificationObservable.call(this, topic)
        .then((o) => {
            observable = o;
            if (this.subscriptions.notification[topic]) {
                return Promise.reject(new Error('Already subscribed to that topic.'));
            }
            const consumerConfig = _.clone(this.config);
            consumerConfig.groupId = groupId;
            consumerConfig.logger = {
                logFunction: debug
            };
            const consumer = this.subscriptions.notification[topic] = new kafka.GroupConsumer(consumerConfig);
            const dataHandler = function (messageSet, topic, partition) {
                messageSet.forEach((msg) => {
                    const message = Message.fromKafka(msg, topic, partition, consumer);
                    observable.next(message);
                });
            };
            const strategies = [{
                subscriptions: [topic],
                handler: dataHandler
            }];
            return this.subscriptions.notification[topic].init(strategies);
        })
        .then(() => {
            return observable;
        });
};

KafkaClient.prototype.createWorkObservable = function createWorkObservable(topic, groupId) {
    // create or join a consumer group
    let observable;
    return Messenger.prototype.createWorkObservable.call(this, topic, groupId)
    .then((o) => {
        observable = o;
        if (this.subscriptions.notification[topic]) {
            return Promise.reject(new Error('Already subscribed to that topic.'));
        }
        const consumerConfig = _.clone(this.config);
        consumerConfig.groupId = groupId;
        consumerConfig.logger = {
            logFunction: debug
        };
        const consumer = this.subscriptions.notification[topic] = new kafka.GroupConsumer(consumerConfig);
        const dataHandler = function (messageSet, topic, partition) {
            messageSet.forEach((msg) => {
                const message = Message.fromKafka(msg, topic, partition, consumer);
                observable.next(message);
            });
        };
        const strategies = [{
            subscriptions: [topic],
            handler: dataHandler
        }];
        return this.subscriptions.notification[topic].init(strategies);
    })
    .then(() => {
        return observable;
    });
};

module.exports = KafkaClient;
