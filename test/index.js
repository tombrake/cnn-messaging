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
        return publisher.publish(new Message());
    });
    it('should not publish otherwise', function () {
        const publisher = new Messenger(amqpTestConfig);
        return publisher.publish('blah')
            .then(() => {
                return Promise.reject(new Error('This should fail'));
            }, () => {
                return Promise.resolve();
            });
    });
    it('should provide a stubbed createNotificationObservable method', function () {
        const subscriber1 = new Messenger(amqpTestConfig);
        return subscriber1.start()
            .then(() => {
                return subscriber1.createNotificationObservable('test.local.message.#');
            });
    });
    it('should provide a stubbed createWorkObservable method', function () {
        const subscriber1 = new Messenger(amqpTestConfig);
        return subscriber1.start()
            .then(() => {
                return subscriber1.createWorkObservable('test.local.message.#', 'fakeWorkQueue');
            });
    });
});

describe('Message', function () {
    it('should provide a getTopic method', function () {
        const msg = new Message({event: {blah: 1}});
        const topic = msg.getTopic();
        topic.should.exist;
    });

    it('should provide map invalid actions', function () {
        const msg = new Message({context: {action: 'new'}});
        (msg.context.action).should.equal('create');
    });

    it('should not accept invalid actions', function () {
        let msg;
        try {
            msg = new Message({context: {action: 'bad'}});
            (true).should.equal(false); //shouldnt get here
        } catch (e) {
            (e).should.exist;
            (msg === undefined).should.be.true;
        }
    });
});

describe('AmqpMessenger', function () {
    it('should start and stop when configured', function () {
        const messenger = new AmqpMessenger(amqpTestConfig);
        return messenger.start()
            .then(() => {
                setTimeout(() => {
                    return messenger.stop();
                }, 2000);
            });
    });

    it('should throw and error when incorrectly configured', function () {
        try {
            const messenger = new AmqpMessenger({});
            (messenger).should.equal(undefined); // should not reach this
        } catch (e) {
            (e).should.exist;
        }
    });

    it('should not start if already started', function () {
        const messenger = new AmqpMessenger(amqpTestConfig);
        return messenger.start()
            .then(() => {
                return messenger.start();
            })
            .catch((err) => {
                (err).should.exist;
            });
    });

    it('should not stop if not started', function () {
        const messenger = new AmqpMessenger(amqpTestConfig);
        return messenger.stop()
            .catch((err) => {
                (err).should.exist;
            });
    });

    it('should not publish a non-message', function () {
        const messenger = new AmqpMessenger(amqpTestConfig);
        return messenger.start()
            .then(() => {
                return messenger.publish('test', true);
            })
            .catch((err) => {
                (err).should.exist;
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
                return subscriber1.createNotificationObservable('test.local.message.#');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createNotificationObservable('test.local.message.#');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    context: {
                        systemId: 'test',
                        environment: 'local',
                        model: 'message',
                        objectId: 123,
                        action: 'insert'
                    },
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish(new Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    const sub1 = observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            sub1.unsubscribe();
                            sub2.unsubscribe();
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

    it('should cleanup queues correctly on unsubscribe', function () {
        const subscriber1 = new AmqpMessenger(amqpTestConfig);
        return subscriber1.start()
            .then(() => {
                return subscriber1.createNotificationObservable('test.*');
            })
            .then((o) => {
                (subscriber1.observables.notification['test.*']).should.exist;
                return o.subscribe();
            })
            .then((sub) => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        sub.unsubscribe();
                        resolve();
                    }, 1000);
                });
            })
            .then(() => {
                (subscriber1.observables.notification['test.*'] === undefined).should.be.true;
                return Promise.resolve();
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
                return subscriber1.createWorkObservable('work.local.message.#', 'test-work-queue');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createWorkObservable('work.local.message.#', 'test-work-queue');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    context: {
                        systemId: 'work',
                        environment: 'local',
                        model: 'message',
                        objectId: 123,
                        action: 'insert'
                    },
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish(new Message(message));
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

    it('a nack\'d message should get reprocessed', function () {
        const publisher = new AmqpMessenger(amqpTestConfig);
        const subscriber1 = new AmqpMessenger(amqpTestConfig);
        const subscriber2 = new AmqpMessenger(amqpTestConfig);
        let observable1;
        let observable2;
        return Promise.all([publisher.start(), subscriber1.start(), subscriber2.start()])
            .then(() => {
                return subscriber1.createWorkObservable('work.local.message.#', 'test-work-queue');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createWorkObservable('work.local.message.#', 'test-work-queue');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    context: {
                        systemId: 'work',
                        environment: 'local',
                        model: 'message',
                        objectId: 123,
                        action: 'insert'
                    },
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish(new Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    const sub1 = observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 1) {
                            message.nack();
                        } else {
                            message.ack();
                        }

                    }, reject, resolve);
                    const sub2 = observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 1) {
                            message.nack();
                        } else {
                            message.ack();
                        }
                    }, reject, resolve);

                    setTimeout(function () {
                        if (messageCount !== 2) {
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

describe('WebsocketRelay standalone service', function () {
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
                ws.send(JSON.stringify({action: 'subscribe', topic: 'test.local.message.#'}));
                setTimeout(() => {
                    amqpMessenger.publish(new Message({
                        context: {
                            systemId: 'test',
                            environment: 'local',
                            model: 'message',
                            objectId: 123,
                            action: 'insert'
                        },
                        event: {
                            some: {
                                thing: '123'
                            }
                        }
                    }));
                }, 100);
            });
            ws.on('message', () => {
                ws.send(JSON.stringify({action: 'unsubscribe', topic: 'test.local.message.#'}));
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
                ws.send(JSON.stringify({action: 'subscribe', topic: 'test.local.message2.#'}));
                setTimeout(() => {
                    amqpMessenger.publish(new Message({
                        context: {
                            systemId: 'test',
                            environment: 'local',
                            model: 'message2',
                            objectId: 123,
                            action: 'insert'
                        },
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

describe('WebsocketRelay on existing http', function () {
    let amqpMessenger;
    const app = require('http').createServer((req, res) => {
        res.send(200);
    });
    before(function () {
        amqpMessenger = new AmqpMessenger({
            amqp: amqpTestConfig.amqp,
            http: app
        });
        return amqpMessenger.start()
            .then(() => {
                app.listen(process.env.PORT || 13001);
            });
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
            const ws = new WebSocket('ws://localhost:13001/', {
                perMessageDeflate: false
            });
            ws.on('open', () => {
                ws.send(JSON.stringify({action: 'subscribe', topic: 'test.local.message.#'}));
                setTimeout(() => {
                    amqpMessenger.publish(new Message({
                        context: {
                            systemId: 'test',
                            environment: 'local',
                            model: 'message',
                            objectId: 123,
                            action: 'insert'
                        },
                        event: {
                            some: {
                                thing: '123'
                            }
                        }
                    }));
                }, 100);
            });
            ws.on('message', () => {
                ws.send(JSON.stringify({action: 'unsubscribe', topic: 'test.local.message.#'}));
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
        });
    });

    it('should unsubscribe from amqp when no clients are listening', function () {
        return new Promise((resolve) => {
            const WebSocket = require('uws');
            const ws = new WebSocket('ws://localhost:13001/', {
                perMessageDeflate: false
            });
            ws.on('open', () => {
                ws.send(JSON.stringify({action: 'subscribe', topic: 'test.local.message2.#'}));
                setTimeout(() => {
                    amqpMessenger.publish(new Message({
                        context: {
                            systemId: 'test',
                            environment: 'local',
                            model: 'message2',
                            objectId: 123,
                            action: 'insert'
                        },
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
            const ws = new WebSocket('ws://localhost:13001/', {
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
            const ws = new WebSocket('ws://localhost:13001/', {
                perMessageDeflate: false
            });

            ws.on('ping', () => {
                resolve();
            });
        });
    });
});
