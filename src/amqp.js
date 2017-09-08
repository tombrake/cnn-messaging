// @flow

import amqplib from 'amqplib';
import Messenger from './messenger';
import Message from './message';
import Rx from 'rxjs';
import Debug from 'debug';
const debug = Debug('cnn-messaging:messenger:amqp');

/**
A messenger that can use amqp topic exchanges and queues
*/
export default class AmqpMessenger extends Messenger {
    params: {
        connectionString: string;
        exchangeName: string;
    };
    channel: {
        notification: any;
        work: any;
    };
    connection: any;

    /**
    Create a new amqp messenger instance
    */
    constructor(params: {
        amqp: {
            connectionString: string;
            exchangeName: string;
        };
        port?: number;
        http?: any;
    }) {
        super(params);
        this.params = params.amqp;
        if (!this.params.connectionString || !this.params.exchangeName) {
            throw new Error('Not properly configured for AMQP. See the README.');
        }
    }

    /**
    start the service
    */
    async start(): Promise<*> {
        if (this.state !== this.states[0]) {
            return Promise.reject(new Error(`Cannot start when in state: ${this.state}`));
        }
        this.state = this.states[1];
        debug('starting');

        let conn;
        try {
            conn = await amqplib.connect(this.params.connectionString);
        } catch (e) {
            return Promise.reject(e);
        }
        this.connection = conn;
        this.connection.on('error', (err) => {
            if (err.message !== 'Connection closing') {
                console.error('AMQP connection error"', err.message);
            }
        });
        this.connection.on('close', () => {
            throw new Error('Lost connection to AMQP.');
        });
        debug('created connection');

        this.channel = {
            notification: await conn.createChannel(),
            work: await conn.createChannel()
        };
        this.channel.work.prefetch(1, true);
        debug('created channels');

        await this.channel.notification.assertExchange(this.params.exchangeName, 'topic', {durable: true});
        this.state = this.states[2];
        debug('started');

        return Promise.resolve();
    }

    /**
    stop the service
    */
    async stop(): Promise<*> {
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
    async publish(topic: string, message: Message): Promise<*> {
        debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
        if (!(message instanceof Message)) {
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
    async _createObservable(topic: string, type: string, queue: string): Promise<Rx.Observable<*>> {
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
        this.observables[type][topic] = new Rx.Observable.create((observer) => {
            // start consuming from the amqp queue
            this.channel[type].consume(this.subscriptions[type][topic], (msg) => {
                observer.next(Message.fromAmqp(msg, this.channel[type]));
            }, {noAck})
                .then((res) => {
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
    async createNotificationObservable(topic: string): Promise<Rx.Observable<*>> {
        return this._createObservable(topic, 'notification', '');
    }

    /**
    create an observable for a given topic, that is meant for a single recipient per message
    */
    async createWorkObservable(topic: string, queue: string): Promise<Rx.Observable<*>> {
        return this._createObservable(topic, 'work', queue);
    }
}
