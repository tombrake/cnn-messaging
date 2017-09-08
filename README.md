# CNN Messaging

[![NPM Package](https://img.shields.io/npm/v/cnn-messaging.svg?style=flat-square)](https://www.npmjs.org/package/cnn-messaging)
[![Build Status](https://img.shields.io/travis/cnnlabs/cnn-messaging.svg?branch=master&style=flat-square)](https://travis-ci.org/cnnlabs/cnn-messaging)
[![Coverage Status](https://img.shields.io/coveralls/cnnlabs/cnn-messaging.svg?branch=master&style=flat-square)](https://coveralls.io/github/cnnlabs/cnn-messaging)
[![Greenkeeper badge](https://badges.greenkeeper.io/cnnlabs/cnn-messaging.svg)](https://greenkeeper.io/)

### What it does

This module provides a Message class to standardize message formats, and an abstraction on top of messaging APIs to provide a common interface for event-source messaging at CNN.

### Testing

To run the tests, use ```docker-compose up -d``` to start the dependancies.

### Quickstart

```
npm install --save cnn-messaging
```

### Debugging

This module uses the [debug module](https://www.npmjs.com/package/debug). Add the environment variable DEBUG=* to enable debug logging in any app using this module.

### New in 3.0.0

* The publish method now supports a shorter signature. Publish no longer requires a topic name. The topic name can be derived from the message. Therefore, the API now allows simply messenger.publish(message). The older style messenger.publish(topic, message) is still supported, but should be considered deprecated.
* For messages sent using the new publish signature, the CRUD actions (the last part of the topic name) are now limited to the following options: ['create', 'update', 'delete', 'upsert', 'event'].
* In an effort to normalize the CRUD actions, __the following action mappings will take place automatically:__ [new: 'create', insert: 'create', remove: 'delete', change: 'update'].

### Messenger API

* ```start()```: This will perform any asynchronous initialization required for the service.
* ```stop()```: This will perform any asynchronous steps for disconnecting and shutting down gracefully.
* ```publish(topic, message)```: This will publish an instance of Message
* ```createNotificationObservable(topic)```: This binds a private queue to a topic. This means that all nodes in a cluster get notifications to their private queue. Returns an Observable.
* ```createWorkObservable(topic, queue)```: This binds a named, shared queue to a topic so that messages are distributed to only one node in a cluster. __These types of messages require an 'ack'__, to acknowledge that they have been processed successfully. Returns an Observable.

See the [API Documentation](https://github.com/cnnlabs/cnn-messaging/blob/master/API.md) file for more specific documentation

### About Observables

The observables returned from the methods above are the RxJs 5 implementation of ES7 Observables.

Observables provide advanced features for event streams, such as filtering, batching, debouncing, etc. Read more about RxJs [here](http://reactivex.io) and [here](https://github.com/ReactiveX/rxjs).

### Publishing messages to RabbitMQ

```
const messenger = require('cnn-messaging').AmqpMessenger(config);
const Message = require('cnn-messaging').Message;

messenger.start()
  .then(() => {
    const message = new Message({
        context: {
            systemId: mySystemName,
            environment: myEnvironmentName,
            model: myModelName,
            objectId: 1234567890,
            action: insert
        },
        event: { // can be any object
            some: 'thing'
        }
    });
    messenger.publish(message);      
  });

```

### Subscribing to notifications from RabbitMQ

Messages are delivered all subscribed instances.

```
const topic = 'mySystemName.myEnvironmentName.myModelName.*.*';
const Messenger = require('cnn-messaging').AmqpMessenger;
const messenger = new Messenger(config);

messenger.start()
  .then(() => {
    return messenger.createNotificationObservable(topic);    
  })
  .then((observable) => {
      observable.subscribe(
          function (message) {
                console.log('New Message: ' + message);
          },
          function (err) {
            console.log('Error: ' + err);
          },
          function () {
            console.log('Completed');
          });

  });

```

### Subscribing to work from RabbitMQ

Messages are delivered to only 1 of many subscribed instances, and must be ack'd or nack'd to get the next message.

Caution: Unlike notification queues, binding a work queue to a topic is not undone automatically when you unsubscribe. Work queues remain bound to topics after a restart, etc. The nature of shared work queues requires this. If you are seeing unexpected messages, check your queue bindings!

```
const topic = 'mySystemName.myEnvironmentName.myModelName.*.*';
const Messenger = require('cnn-messaging').AmqpMessenger;
const messenger = new Messenger(config);

messenger.start()
  .then(() => {
    return messenger.createWorkObservable(topic, 'test-work-queue'); // you must provide a work queue name  
  })
  .then((observable) => {
      observable.subscribe(
          function (message) {
                console.log('New Message: ' + message);
                // process message, then
                message.ack(messenger.channel.work); // you must ack a message to get another one
          },
          function (err) {
            console.log('Error: ' + err);
          },
          function () {
            console.log('Completed');
          });

  });

```

### Websocket Relay from RabbitMQ

If you provide a port or http instance as a parameter to the Messenger, then it will enable a websocket relay.

Note: This functionality requires the optional uws module to be installed.

```
const Messenger = require('cnn-messaging').AmqpMessenger;
const messenger = new Messenger({
    amqp: {
        connectionString: 'amqp://localhost:5672',
        exchangeName: 'EXAMPLE_APP'
    },
    http: httpServerInstance // this can be http, express, hapi, etc
});

return messenger.start()
    .then(() => {
        httpServer.listen(3000);
    });
```

### Example App

The example app runs in the web browser, and demonstrates wildcard subscription to topics from the Amqp Messenger.

To run the example app, run
```
npm install
docker-compose up -d
npm run example
```

and open the browser to [http://localhost:3000](http://localhost:3000)

See tests for more examples.
