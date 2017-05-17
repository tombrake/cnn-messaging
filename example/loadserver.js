'use strict';

const Message = require('../index').Message;
const amqpMessenger = require('../index').AmqpMessenger({
    amqp: {
        connectionString: process.env.AMQP_CONN_STRING || 'amqp://localhost:5672',
        exchangeName: process.env.AMQP_EXCHANGE || 'MOCHA_TEST'
    },
    port: process.env.PORT || 13000
});

console.log('Starting on port', process.env.PORT || 13000);
amqpMessenger.start();

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
