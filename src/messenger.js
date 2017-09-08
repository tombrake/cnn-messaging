// @flow

import events from 'events';
import Rx from 'rxjs';
import Message from './message';
import WebsocketRelay from './websocket';
import Debug from 'debug';
const debug = Debug('cnn-messaging:messenger');

/**
An in-memory messenger, providing pub/sub like features
*/
export default class Messenger extends events.EventEmitter {
    state: string;
    subscriptions: {
        notification: Object;
        work: Object;
    }
    observables: {
        notification: Object;
        work: Object;
    }
    states: Array<string>;
    websocketRelay: WebsocketRelay;

    /**
    Create a new messenger instance
    */
    constructor(params: {port?: number, http?: any}) {
        super();
        params = params || {};
        this.states = [
            'STOPPED',
            'STARTING',
            'STARTED',
            'STOPPING',
            'ERROR'
        ];
        this.state = this.states[0];
        this.subscriptions = {
            notification: {},
            work: {}
        };
        this.observables = {
            notification: {},
            work: {}
        };
        if (params.port) {
            const interval = (process.env.PINGINTERVAL && parseInt(process.env.PINGINTERVAL)) || 30000;
            debug('got port, creating websocket relay with ping interval', interval);
            this.websocketRelay = new WebsocketRelay({
                port: params.port,
                messenger: this,
                pingInterval: interval
            });
        }
        if (params.http) {
            const interval = (process.env.PINGINTERVAL && parseInt(process.env.PINGINTERVAL)) || 30000;
            debug('got http server, creating websocket relay with ping interval', interval);
            this.websocketRelay = new WebsocketRelay({
                http: params.http,
                messenger: this,
                pingInterval: interval
            });
        }
    }

    /**
    start the service
    */
    async start(): Promise<*> {
        return new Promise((resolve, reject) => {
            if (this.state !== this.states[0]) {
                return reject(new Error(`Cannot start when in state: ${this.state}`));
            }
            this.state = this.states[1];
            debug('starting');

            this.state = this.states[2];
            debug('started');

            resolve();
        });
    }

    /**
    stop the service
    */
    async stop(): Promise<*> {
        return new Promise((resolve, reject) => {
            if (this.state !== this.states[2]) {
                return reject(new Error(`Cannot stop when in state: ${this.state}`));
            }
            this.state = this.states[3];
            debug('stopping');

            this.state = this.states[0];
            debug('stopped');

            resolve();
        });
    }

    /**
    publish a message to a topic
    */
    async publish(topicOrMessage: any, messageOnly?: Message): Promise<*> {
        // support old method signature
        const message = (messageOnly || topicOrMessage: Message);
        let topic = topicOrMessage;
        if (typeof topicOrMessage !== 'string') {
            topic = message.getTopic();
        }

        debug(`publish to topic: ${topic}, message: ${JSON.stringify(message)}`);
        if (!(message instanceof Message)) {
            return Promise.reject(new Error('provided message is not an instance of Message'));
        }
        return Promise.resolve();
    }

    /**
    create an observable for a given topic, that is meant for multiple recipients per message
    */
    async createNotificationObservable(topic: string): Promise<Rx.Observable<*>> {
        debug(`creating observable for topic: ${topic}`);
        return Promise.resolve(new Rx.Subject());
    }

    /**
    create an observable for a given topic, that is meant for a single recipient per message
    */
    async createWorkObservable(topic: string, sharedQueue: string): Promise<Rx.Observable<*>> {
        debug(`creating observable for: ${sharedQueue} to topic: ${topic}`);
        return Promise.resolve(new Rx.Subject());
    }
}
