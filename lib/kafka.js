'use strict';

const util = require('util');
const Messenger = require('./messenger');

function KafkaClient(config) {
    if (!(this instanceof KafkaClient)) {
        return new KafkaClient(config);
    }
    Messenger.call(this);
    this.config = config.kafka;
    if (!this.config.connectionString || !this.config.exchangeName) {
        throw new Error('Not properly configured for Kafka. See the README.');
    }
}

util.inherits(KafkaClient, Messenger);


KafkaClient.prototype.start = function start() {
    return Messenger.prototype.start.call(this);
};

KafkaClient.prototype.stop = function stop() {
    return Messenger.prototype.stop.call(this);
};

KafkaClient.prototype.publish = function publish(topic, message) {
    return Messenger.prototype.publish.call(this, topic, message);
};

KafkaClient.prototype.subscribe = function subscribe(topic) {
    return Messenger.prototype.subscribe.call(this, topic);
};

module.exports = KafkaClient;
