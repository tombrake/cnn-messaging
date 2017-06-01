'use strict';

const http = require('http');
const express = require('express');
const metrics = require('cnn-metrics');
const app = express();

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/health', function (req, res) {
    res.send({message: 'noop'});
});

const server = http.createServer(app);

const Message = require('../index').Message;
const Messenger = require('../index').AmqpMessenger;
const messenger = new Messenger({
    amqp: {
        connectionString: process.env.AMQP_CONN_STRING || 'amqp://localhost:5672',
        exchangeName: process.env.AMQP_EXCHANGE || 'MOCHA_TEST'
    },
    http: server
});

metrics.init({
    appName: 'cnn-messaging-loadtest',
    appType: 'api',  // or 'fe'
    customer: 'cnn',
    flushEvery: 1000 * 2
});

messenger.start()
    .then(() => {
        server.listen(process.env.PORT || 13000, function listening() {
            console.log('Listening on %d', server.address().port);
        });
    });

setInterval(() => {
    metrics.histogram('wsconns', messenger.websocketRelay.connections);
});

if (process.env.RUNPUBLISHER) {
    setInterval(() => {
        messenger.publish('test.message.new', new Message({
            event: {
                some: {
                    thing: Math.random()
                }
            }
        }));
    }, (process.env.INTERVAL && parseInt(process.env.INTERVAL)) || 30000);
}

setInterval(() => {
    const subscribedTopics = Object.keys(messenger.websocketRelay.subscriptions);
    console.log('Subscribed to', subscribedTopics.length, 'topics');
    subscribedTopics.forEach((topic) => {
        console.log('- topic:', topic, 'subscribers:', Object.keys(messenger.websocketRelay.subscriptions[topic]).length);
    });
}, 60000);
