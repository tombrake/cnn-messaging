'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _v = require('uuid/v1');

var _v2 = _interopRequireDefault(_v);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const debug = (0, _debug2.default)('cnn-messaging:message');

const defaults = {
    systemId: 'unknownSystemId',
    environment: 'unknownEnvironment',
    model: 'unknownModel',
    objectId: 'unknownObjectId',
    action: 'unknownAction'
};

/**
A Message object
*/
class Message {

    /**
    create a new instance of Message
    */
    constructor(message) {
        debug('new message', message);
        message = message || { context: {} };
        this.context = message.context;
        this.event = message.event;
        this.id = message.id || (0, _v2.default)();
        this.timestamp = message.timestamp || new Date().toISOString();
    }

    /**
    Stringify the message
    */
    toString() {
        const shadow = {
            id: this.id,
            timestamp: this.timestamp,
            context: this.context,
            event: this.event
        };
        return JSON.stringify(shadow);
    }

    /**
    Convert the message for websocket delivery
    */
    toWS() {
        return this.toString();
    }

    /**
    Convert the message for amqp delivery
    */
    toAmqp() {
        return new Buffer(this.toString());
    }

    /**
    Get the preferred topic name from the message context
    */
    getTopic() {
        const topic = [];
        const context = this.context || {};
        topic.push(context.systemId || defaults['systemId']);
        topic.push(context.environment || defaults['environment']);
        topic.push(context.model || defaults['model']);
        topic.push(context.objectId || defaults['objectId']);
        topic.push(context.action || defaults['action']);
        return topic.join('.');
    }

    /**
    Ack a work message (mark it as completed)
    */
    ack() {
        if (this.meta && this.meta.rawMessage && this.meta.channel) {
            debug('Ack message', this.meta.rawMessage);
            this.meta.channel.ack(this.meta.rawMessage);
        }
    }

    /**
    Nack a work message (mark it as failed, for redelivery)
    */
    nack() {
        if (this.meta && this.meta.rawMessage && this.meta.channel) {
            debug('Nack message', this.meta.rawMessage);
            this.meta.channel.nack(this.meta.rawMessage);
        }
    }

    /**
    Convert a raw amqp message into an instance of Message
    */
    static fromAmqp(rawMessage, channel) {
        debug(`from amqp: ${JSON.stringify(rawMessage)}`);
        const messageString = rawMessage.content.toString();
        const messageObject = JSON.parse(messageString);
        const message = new Message(messageObject);
        message.meta = {
            rawMessage,
            channel
        };
        return message;
    }
}
exports.default = Message;
module.exports = exports['default'];