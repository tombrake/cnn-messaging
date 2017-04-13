# CNN Messaging

### What it does

This module provides a Message class to standardize message formats, and an abstraction on top of messaging APIs to provide a common interface for event-source messaging at CNN.

### Testing

To run the tests, use ```docker-compose up -d``` to start the dependancies.

### Quickstart

```
npm install --save cnn-messaging
```

then

```
const topic = 'some.topic.name';
const messenger = require('cnn-messaging').AmqpMessenger(config);
const Message = require('cnn-messaging').Message;

messenger.start()
  .then(() => {
    const message = new Message({body: {some: 'thing'}}))
    messenger.publish(topic, message);      
  })

```

See tests for more examples.

### API

* ```start()```: This will perform any asynchronous initialization required for the service.
* ```stop()```: This will perform any asynchronous steps for disconnecting and shutting down gracefully.
* ```publish(topic, message)```: This will publish an instance of Message
* ```createNotificationObservable(topic)```: This binds a private queue to a topic. This means that all nodes in a cluster get notifications to their private queue. Returns an Observable.
* ```createWorkObservable(topic, queue)```: This binds a named, shared queue to a topic so that messages are distributed to only one node in a cluster. __These types of messages require an 'ack'__, to acknowledge that they have been processed successfully. Returns an Observable.

### About Observables

The observables returned from the methods above are the RxJs implementation of ES6 Observables. More specifically, they are of type Rx.Subject();

Observables provides advanced features for event streams, such as filtering, batching, debouncing, etc. Read more about RxJs [here](http://reactivex.io) and [here](https://github.com/Reactive-Extensions/RxJS).
