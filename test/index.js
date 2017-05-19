'use strict';

const chai = require('chai');
chai.should();

const Messenger = require('../index').Messenger;
const AmqpMessenger = require('../index').AmqpMessenger;
const Message = require('../index').Message;

const amqpTestConfig = {
    amqp: {
        connectionString: 'amqp://localhost:5672',
        exchangeName: 'MOCHA_TEST'
    }
};

describe('Basic Functionality', function () {

    it('should not start without a config', function () {
        try {
            const messenger = new Messenger();
            (messenger).should.not.exist;
        } catch (e) {
            (e).should.exist;
        }
    });
    it('should not start with a bad amqp config', function () {
        try {
            const messenger = new Messenger({amqp: {blah: true}});
            (messenger).should.not.exist;
        } catch (e) {
            (e).should.exist;
        }
    });
    it('should start when not started', function () {
        const messenger = new Messenger(amqpTestConfig);
        return messenger.start();
    });
    it('should not start otherwise', function () {
        const messenger = new Messenger(amqpTestConfig);
        return messenger.start()
            .then(() => {
                return messenger.start()
                    .then(() => {
                        return Promise.reject(new Error('This should fail'));
                    }, () => {
                        return Promise.resolve();
                    });
            });
    });
    it('should stop when started', function () {
        const messenger = new Messenger(amqpTestConfig);
        return messenger.start()
            .then(() => {
                messenger.state = 'STARTED';
                return messenger.stop();
            });
    });
    it('should not stop when not started', function () {
        const messenger = new Messenger(amqpTestConfig);
        return messenger.stop()
            .then(() => {
                return Promise.reject(new Error('This should fail'));
            }, () => {
                return Promise.resolve();
            });
    });
    it('should publish instance of Message', function () {
        const publisher = new Messenger(amqpTestConfig);
        return publisher.publish('test.message', new Message());
    });
    it('should not publish otherwise', function () {
        const publisher = new Messenger(amqpTestConfig);
        return publisher.publish('test.message', 'blah')
            .then(() => {
                return Promise.reject(new Error('This should fail'));
            }, () => {
                return Promise.resolve();
            });
    });
});

describe('Message', function () {
    it('should provide a getTopic method', function () {
        const msg = new Message({event: {blah: 1}});
        const topic = msg.getTopic();
        topic.should.exist;
    });
});

describe('AmqpMessenger', function () {
    it('should start and stop', function () {
        const messenger = new AmqpMessenger(amqpTestConfig);
        return messenger.start()
            .then(() => {
                return messenger.stop();
            });
    });

    it('multiple notification subscribers should get a notification', function () {
        const publisher = new AmqpMessenger(amqpTestConfig);
        const subscriber1 = new AmqpMessenger(amqpTestConfig);
        const subscriber2 = new AmqpMessenger(amqpTestConfig);
        let observable1;
        let observable2;
        return Promise.all([publisher.start(), subscriber1.start(), subscriber2.start()])
            .then(() => {
                return subscriber1.createNotificationObservable('test.*');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createNotificationObservable('test.*');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish('test.message', new Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    const sub1 = observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            resolve();
                        }
                    }, reject, resolve);
                    const sub2 = observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            sub1.unsubscribe();
                            sub2.unsubscribe();
                            resolve();
                        }
                    }, reject, resolve);
                });
            });
    });

    it('only a single work subscriber should get work', function () {
        const publisher = new AmqpMessenger(amqpTestConfig);
        const subscriber1 = new AmqpMessenger(amqpTestConfig);
        const subscriber2 = new AmqpMessenger(amqpTestConfig);
        let observable1;
        let observable2;
        return Promise.all([publisher.start(), subscriber1.start(), subscriber2.start()])
            .then(() => {
                return subscriber1.createWorkObservable('work.*', 'test-work-queue');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createWorkObservable('work.*', 'test-work-queue');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish('work.message', new Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    const sub1 = observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        message.ack();
                    }, reject, resolve);
                    const sub2 = observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        message.ack();
                    }, reject, resolve);

                    setTimeout(function () {
                        if (messageCount !== 1) {
                            reject(new Error(`messageCount: ${messageCount}`));
                        } else {
                            sub1.unsubscribe();
                            sub2.unsubscribe();
                            resolve();
                        }
                    }, 500);
                });
            });
    });
});

describe('WebsocketRelay', function () {
    let amqpMessenger;
    before(function () {
        amqpMessenger = new AmqpMessenger({
            amqp: amqpTestConfig.amqp,
            port: 13000
        });
        return amqpMessenger.start();
    });

    after(function () {
        return new Promise((resolve) => {
            setTimeout(() => {
                return amqpMessenger.stop()
                    .then(resolve);
            }, 100);
        });
    });

    it('should throw an error when missing an http server instance and an amqp messenger instance', function () {
        try {
            require('../index').WebsocketRelay();
            return Promise.reject();
        } catch (e) {
            e.should.exist;
            return Promise.resolve();
        }
    });

    it('should allow a client to subscribe to events and receive messages', function () {
        return new Promise((resolve) => {
            const WebSocket = require('uws');
            const ws = new WebSocket('ws://localhost:13000/', {
                perMessageDeflate: false
            });
            ws.on('open', () => {
                ws.send(JSON.stringify({action: 'subscribe', topic: 'test.message.*'}));
                setTimeout(() => {
                    amqpMessenger.publish('test.message.new', new Message({
                        event: {
                            some: {
                                thing: '123'
                            }
                        }
                    }));
                }, 100);
            });
            ws.on('message', () => {
                ws.send(JSON.stringify({action: 'unsubscribe', topic: 'test.message.*'}));
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
        });
    });

    it('should unsubscribe from amqp when no clients are listening', function () {
        return new Promise((resolve) => {
            const WebSocket = require('uws');
            const ws = new WebSocket('ws://localhost:13000/', {
                perMessageDeflate: false
            });
            ws.on('open', () => {
                ws.send(JSON.stringify({action: 'subscribe', topic: 'test.message2.*'}));
                setTimeout(() => {
                    amqpMessenger.publish('test.message2.new', new Message({
                        event: {
                            some: {
                                thing: '123'
                            }
                        }
                    }));
                }, 100);
            });
            ws.on('message', () => {
                ws.close();
                resolve();
            });
        });
    });

    it('should ignore unknown messages', function () {
        return new Promise((resolve, reject) => {
            const WebSocket = require('uws');
            const ws = new WebSocket('ws://localhost:13000/', {
                perMessageDeflate: false
            });
            ws.on('open', () => {
                ws.send(JSON.stringify({action: 'blah', topic: 'test.message2.*'}));
            });
            setTimeout(() => {
                resolve();
            }, 1000);
            ws.on('message', () => {
                ws.close();
                reject();
            });
        });
    });

    it('should send ping messages', function () {
        return new Promise((resolve) => {
            const WebSocket = require('uws');
            const ws = new WebSocket('ws://localhost:13000/', {
                perMessageDeflate: false
            });

            ws.on('ping', () => {
                resolve();
            });
        });
    });
});
