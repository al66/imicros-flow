

//import { createMachine, interpret } from 'xstate';
const { createMachine, interpret } = require('xstate');

class Instance {
  constructor() {

    // Stateless machine definition
    this.instanceMachine = createMachine({
      id: 'my unqiue id',
      initial: 'created',
      context: {},
      predictableActionArguments: true,
      states: {
        created: { on: { START: 'running' } },
        running: { on: { STOP: { 
          target: 'persisting',
          actions: [
            (context, event) => console.log("Action", event, context)
          ] 
        }}},
        persisting: { on: { SAVED: 'persistent' }},
        persistent: { on: { START: 'loading' } },
        loading: { on: { LOADED: 'running' }}
      },
      on: {
        TOKEN: { 
          actions: [
            (context, event) => console.log("Action", event, context)
          ] 
        }
      }
    });

    // Machine instance with internal state
    this.instanceService = interpret(this.instanceMachine)
      .onTransition((state) => console.log("Transition",state.value))
      .onStop((event) => console.log("Event",event))
      .start();
  }

  start() {
    this.instanceService.send('START');
    // => 'loading'
    this.instanceService.send('LOADED');
    // => 'running'
  }

  processToken({ token }) {
    this.instanceService.send({ type: 'TOKEN', token });
  }
  
  async stop() {
    this.instanceService.send({ type: 'STOP', test: 'A' });

    this.instanceService.send('SAVED');
    // => 'persistent'
  }
}

const instance = new Instance();
// => 'created'

instance.start()
// => 'running'

instance.stop()
// => 'persisting'

instance.start();
// => 'loading'

instance.processToken({ token: { test: 'B' }});
// => 'running'


