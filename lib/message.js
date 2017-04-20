'use strict';

const debug = require('debug')('cnn-messaging:message');
const _ = require('lodash');
const uuidV1 = require('uuid/v1');
const Joi = require('joi');

const messageSchema = Joi.object().keys({
    id: Joi.string(),
    timestamp: Joi.date(),
    context: Joi.object().keys({
        userId: Joi.string(),
        systemId: Joi.string(),
        requestId: Joi.string()
    }),
    change: ({
        model: Joi.string(),
        action: Joi.string(),
        objectId: [Joi.string(), Joi.number()],
        objectVersion: [Joi.string(), Joi.number(), Joi.date()],
        objectChanges: Joi.object().keys({
            add: Joi.object(),
            remove: Joi.object(),
            update: Joi.object().keys({
                old: Joi.object(),
                new: Joi.object()
            }),
            increment: Joi.object(),
            decrement: Joi.object(),
            push: Joi.object(),
            pop: Joi.object(),
            shift: Joi.object(),
            unshift: Joi.object()
        })
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

Message.fromWS = function fromWS(message) {
    return JSON.parse(message);
};

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

Message.prototype.ack = function ack() {
    debug('This method should be overwritten');
    throw new Error('This message cannot be ack\'d');
};

Message.prototype.nack = function nack() {
    debug('This method should be overwritten');
    throw new Error('This message cannot be nack\'d');
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
