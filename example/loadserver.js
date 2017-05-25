'use strict';

const http = require('http');
const express = require('express');
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
const amqpMessenger = require('../index').AmqpMessenger({
    amqp: {
        connectionString: process.env.AMQP_CONN_STRING || 'amqp://localhost:5672',
        exchangeName: process.env.AMQP_EXCHANGE || 'MOCHA_TEST'
    },
    http: server
});

amqpMessenger.start()
    .then(() => {
        server.listen(process.env.PORT || 13000, function listening() {
            console.log('Listening on %d', server.address().port);
        });
    });

setInterval(() => {
    amqpMessenger.publish('test.message.new', new Message({
        event: {
            some: {
                thing: Math.random()
            }
        }
    }));
}, (process.env.INTERVAL && parseInt(process.env.INTERVAL)) || 30000);

setInterval(() => {
    const subscribedTopics = Object.keys(amqpMessenger.websocketRelay.subscriptions);
    console.log('Subscribed to', subscribedTopics.length, 'topics');
    subscribedTopics.forEach((topic) => {
        console.log('- topic:', topic, 'subscribers:', Object.keys(amqpMessenger.websocketRelay.subscriptions[topic]).length);
    });
}, 60000);
