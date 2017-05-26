'use strict';

const app = require('http').createServer(handler);
const fs = require('fs');
const uuidV1 = require('uuid/v1');
const Message = require('../index').Message;
const Messenger = require('../index').AmqpMessenger;
const messenger = new Messenger({
    amqp: {
        connectionString: 'amqp://localhost:5672',
        exchangeName: 'EXAMPLE_APP'
    },
    http: app
});

messenger.start()
    .then(() => {
        console.log(`Starting http on port ${process.env.PORT || 3000}`);
        app.listen(process.env.PORT || 3000);
    });

function handler(req, res) {
    fs.readFile(`${__dirname}/index.html`,
    function (err, data) {
        if (err) {
            res.writeHead(500);
            return res.end('Error loading index.html');
        }

        const objectId = uuidV1();
        setTimeout(() => {
            messenger.publish('test.message.new', new Message({
                context: {
                    model: 'person',
                    action: 'new',
                    objectId,
                    objectVersion: 1
                },
                event: {
                    add: {
                        name: {
                            first: 'Bob'
                        }
                    }
                }
            }));
        }, 2000);

        setTimeout(() => {
            messenger.publish('test.message.update', new Message({
                context: {
                    model: 'person',
                    action: 'update',
                    objectId,
                    objectVersion: 2
                },
                event: {
                    add: {
                        name: {
                            last: 'Thibault'
                        }
                    }
                }
            }));
        }, 4000);

        setTimeout(() => {
            messenger.publish('test.message.update', new Message({
                context: {
                    model: 'person',
                    action: 'update',
                    objectId,
                    objectVersion: 3
                },
                event: {
                    add: {
                        status: 'Listening to John Lennon',
                        favoriteSongs: [],
                        songsHeard: 0
                    }
                }
            }));
        }, 6000);

        setTimeout(() => {
            messenger.publish('test.message.update', new Message({
                context: {
                    model: 'person',
                    action: 'update',
                    objectId,
                    objectVersion: 4
                },
                event: {
                    push: {
                        favoriteSongs: 'Imagine'
                    },
                    increment: {
                        songsHeard: 1
                    }
                }
            }));
        }, 8000);

        setTimeout(() => {
            messenger.publish('test.message.update', new Message({
                context: {
                    model: 'person',
                    action: 'update',
                    objectId,
                    objectVersion: 5
                },
                event: {
                    push: {
                        favoriteSongs: 'Strawberry Fields'
                    },
                    increment: {
                        songsHeard: 1
                    }
                }
            }));
        }, 10000);

        res.writeHead(200);
        res.end(data);
    });
}
