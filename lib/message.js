'use strict';

const debug = require('debug')('cnn-messaging:message');
const _ = require('lodash');
const uuidV1 = require('uuid/v1');
const Joi = require('joi');

const messageSchema = Joi.object().keys({
    id: Joi.string(),
    timestamp: Joi.date(),
    context: Joi.object().keys({
        systemId: Joi.string(),
        environment: Joi.string(),
        userId: Joi.string(),
        requestId: Joi.string(),
        model: Joi.string(),
        objectId: [Joi.string(), Joi.number()],
        action: Joi.string(),
        objectVersion: [Joi.string(), Joi.number(), Joi.date()]
    }),
    event: Joi.object()
});

function Message(messageObject) {
    if (!(this instanceof Message)) {
        return new Message(messageObject);
    }
    const validate = Joi.validate(messageObject, messageSchema);
    if (validate.error) {
        throw validate.error;
    }
    if (!this.id) {
        this.id = uuidV1();
    }
    if (!this.timestamp) {
        this.timestamp = (new Date()).toISOString();
    }
    _.assign(this, messageObject);
}

Message.fromAmqp = function fromAmqp(rawMessage, channel) {
    debug(`from amqp: ${JSON.stringify(rawMessage)}`);
    const messageString = rawMessage.content.toString();
    const messageObject = JSON.parse(messageString);
    const message = new Message(messageObject);
    message.ack = function ack() {
        debug('Ack message');
        channel.ack(rawMessage);
    };
    message.nack = function nack() {
        debug('Nack message');
        channel.nack(rawMessage);
    };
    return message;
};

Message.prototype.toWS = function toWS() {
    // convert 'this' to a message that can be published to kafka
    return JSON.stringify(this);
};

Message.prototype.toAmqp = function toAmqp() {
    // convert 'this' to a message that can be published to amqp
    return Buffer.from(JSON.stringify(this));
};

module.exports = Message;
