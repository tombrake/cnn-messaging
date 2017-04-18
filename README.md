# CNN Messaging

### What it does

This module provides a Message class to standardize message formats, and an abstraction on top of messaging APIs to provide a common interface for event-source messaging at CNN.

### Testing

To run the tests, use ```docker-compose up -d``` to start the dependancies.

### Quickstart

```
npm install --save cnn-messaging
```

### API

* ```start()```: This will perform any asynchronous initialization required for the service.
* ```stop()```: This will perform any asynchronous steps for disconnecting and shutting down gracefully.
* ```publish(topic, message)```: This will publish an instance of Message
* ```createNotificationObservable(topic)```: This binds a private queue to a topic. This means that all nodes in a cluster get notifications to their private queue. Returns an Observable.
* ```createWorkObservable(topic, queue)```: This binds a named, shared queue to a topic so that messages are distributed to only one node in a cluster. __These types of messages require an 'ack'__, to acknowledge that they have been processed successfully. Returns an Observable.

### About Observables

The observables returned from the methods above are the RxJs 5 implementation of ES7 Observables.

Observables provide advanced features for event streams, such as filtering, batching, debouncing, etc. Read more about RxJs [here](http://reactivex.io) and [here](https://github.com/ReactiveX/rxjs).

### Publishing messages

```
const topic = 'some.topic.name';
const messenger = require('cnn-messaging').AmqpMessenger(config);
const Message = require('cnn-messaging').Message;

messenger.start()
  .then(() => {
    const message = new Message({event: {some: 'thing'}}));
    messenger.publish(topic, message);      
  })

```

### Subscribing to notifications

Messages are delivered all subscribed instances.

```
const topic = 'some.topic.name';
const messenger = require('cnn-messaging').AmqpMessenger(config);

messenger.start()
  .then(() => {
    return messenger.createNotificationObservable('notification.*');    
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

### Subscribing to work

Messages are delivered to only 1 of many subscribed instances, and must be ack'd or nack'd to get the next message.

```
const topic = 'some.topic.name';
const messenger = require('cnn-messaging').AmqpMessenger(config);

messenger.start()
  .then(() => {
    return messenger.createWorkObservable('work.*', 'test-work-queue'); // you must provide a work queue name  
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

See tests for more examples.
