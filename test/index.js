'use strict';

const chai = require('chai');
chai.should();

const AmqpClient = require('../lib/amqp');
const KafkaClient = require('../lib/kafka');
const Messenger = require('../lib/messenger');
const Message = require('../lib/message');

const amqpTestConfig = {
    amqp: {
        connectionString: 'amqp://localhost:5672',
        exchangeName: 'MOCHA_TEST'
    }
};

const kafkaTestConfig = {
    kafka: {
        connectionString: 'kafka://golden-hang-glider-01.srvs.cloudkafka.com:9093',
        ssl: {
            key: './private_key.pem',
            cert: './signed_cert.pem'
        }
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
        const publisher = Messenger(amqpTestConfig);
        return publisher.publish('test.message', new Message());
    });
    it('should not publish otherwise', function () {
        const publisher = Messenger(amqpTestConfig);
        return publisher.publish('test.message', 'blah')
            .then(() => {
                return Promise.reject(new Error('This should fail'));
            }, () => {
                return Promise.resolve();
            });
    });
});

describe('AmqpClient', function () {
    it('should start and stop', function () {
        const messenger = AmqpClient(amqpTestConfig);
        return messenger.start()
            .then(() => {
                return messenger.stop();
            });
    });

    it('multiple notification subscribers should get a notification', function () {
        const publisher = AmqpClient(amqpTestConfig);
        const subscriber1 = AmqpClient(amqpTestConfig);
        const subscriber2 = AmqpClient(amqpTestConfig);
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
                return publisher.publish('test.message', Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            resolve();
                        }
                    }, reject, resolve);
                    observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            resolve();
                        }
                    }, reject, resolve);
                });
            });
    });

    it('only a single work subscriber should get work', function () {
        const publisher = AmqpClient(amqpTestConfig);
        const subscriber1 = AmqpClient(amqpTestConfig);
        const subscriber2 = AmqpClient(amqpTestConfig);
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
                return publisher.publish('work.message', Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        message.ack();
                    }, reject, resolve);
                    observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        message.ack();
                    }, reject, resolve);

                    setTimeout(function () {
                        if (messageCount !== 1) {
                            reject(new Error(`messageCount: ${messageCount}`));
                        } else {
                            resolve();
                        }
                    }, 500);
                });
            });
    });
});

describe('KafkaClient', function () {
    it('should start and stop', function () {
        const messenger = KafkaClient(kafkaTestConfig);
        return messenger.start()
            .then(() => {
                return messenger.stop();
            });
    });

    it('multiple notification subscribers should get a notification', function () {
        const publisher = KafkaClient(kafkaTestConfig);
        const subscriber1 = KafkaClient(kafkaTestConfig);
        const subscriber2 = KafkaClient(kafkaTestConfig);
        let observable1;
        let observable2;
        return Promise.all([publisher.start(), subscriber1.start(), subscriber2.start()])
            .then(() => {
                return subscriber1.createNotificationObservable('test.notification');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createNotificationObservable('test.notification');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish('test.notification', Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            resolve();
                        }
                    }, reject, resolve);
                    observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        if (messageCount == 2) {
                            resolve();
                        }
                    }, reject, resolve);
                });
            });
    });

    it('only a single work subscriber should get work', function () {
        const publisher = KafkaClient(kafkaTestConfig);
        const subscriber1 = KafkaClient(kafkaTestConfig);
        const subscriber2 = KafkaClient(kafkaTestConfig);
        let observable1;
        let observable2;
        return Promise.all([publisher.start(), subscriber1.start(), subscriber2.start()])
            .then(() => {
                return subscriber1.createWorkObservable('test.work', 'shared-work-group');
            })
            .then((o) => {
                observable1 = o;
                return subscriber2.createWorkObservable('test.work', 'shared-work-group');
            })
            .then((o) => {
                observable2 = o;
                const message = {
                    event: {
                        text: 'test'
                    }
                };
                return publisher.publish('test.work', Message(message));
            })
            .then(() => {
                let messageCount = 0;
                return new Promise((resolve, reject) => {
                    observable1.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        message.ack();
                    }, reject, resolve);
                    observable2.subscribe((message) => {
                        (message.event.text).should.equal('test');
                        messageCount++;
                        message.ack();
                    }, reject, resolve);

                    setTimeout(function () {
                        if (messageCount !== 1) {
                            reject(new Error(`messageCount: ${messageCount}`));
                        } else {
                            resolve();
                        }
                    }, 5000);
                });
            });
    });
});
