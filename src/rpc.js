const SequenceNumber = require('./sequence-number');

class RpcUtils {
    static createClientQueue(resource, identifier){
        return `${resource}:client:${identifier}`;
    }
}

/* TODO LIST
- We should support timeouts
- Improve reliability for failed scenarios
*/
class RpcClient {
    #resource;
    #__inFlight = {}; //TODO: This would not perform well. What if there are some thousands of concurrent requests? Acessing large objects via indexing would cause a huge perf hit.
    #__assertedResponseQueue = false;
    #__identifier;
    #__seqNumber = 0;
    constructor(resource, amqpChannel){
        this.#resource = resource;
        this.amqpChannel = amqpChannel;
        this.#__identifier = `${SequenceNumber.generateHash(resource)}`;
    }

    static create(clazz, amqpChannel){
        const client = new RpcClient(clazz.name, amqpChannel);
        const enhancedClazz = class {};
        for(const key of Object.getOwnPropertyNames(clazz.prototype)){
            if(key === 'constructor'){
                continue;
            }
            Object.defineProperty(enhancedClazz.prototype, key, {
                value(){
                    return client.call(key, ...arguments);
                }
            })
        }
        return enhancedClazz;
    }

    async call(method, ...args){
        return new Promise(async (resolve, reject) => {
            try {
                const methodName = `${this.#resource}:${method}`;
                const _id = `${Date.now()}#${++this.#__seqNumber}`;
                this.#__inFlight[_id] = resolve;
                await this.subscribeToResponse(methodName);
                //TODO: Should we dynamically create the Queue?
                await this.amqpChannel.publish(this.#resource, methodName, Buffer.from(JSON.stringify([...args])), { replyTo: this.#__identifier, correlationId: _id });
            } catch(err){
                return reject(err);
            }
        })
    }

    async subscribeToResponse() {
        if(this.#__assertedResponseQueue){
            return;
        }

        //TODO: try catch and remove if fail
        const methodResponseQueue = RpcUtils.createClientQueue(this.#resource, this.#__identifier);
        await this.amqpChannel.assertExchange(this.#resource, 'direct');
        await this.amqpChannel.assertQueue(methodResponseQueue, { exclusive: true });
        await this.amqpChannel.bindQueue(methodResponseQueue, this.#resource, methodResponseQueue);
        return this.amqpChannel.consume(methodResponseQueue, async (message) => {
            const { properties: { correlationId }, content } = message;
            const method = this.#__inFlight[correlationId];
            if(!method){
                console.log(`debug: ${correlationId} not found for client ${this.#__identifier}`);
                return this.amqpChannel.ack(message);
            }
            await this.#__inFlight[correlationId](JSON.parse(content));
            delete this.#__inFlight[correlationId];
            this.amqpChannel.ack(message);
        });
    }
}

class RpcServer {
    #resource;
    #channel;
    #methods;
    constructor(resource, amqpChannel){
        this.#resource = resource;
        this.#channel = amqpChannel;
        this.#methods = new Map();
    }

    static create(clazz, amqpChannel){
        const server = new RpcServer(clazz.name, amqpChannel);
        const enhancedClazz = class {};
        for(const key of Object.getOwnPropertyNames(clazz.prototype)){
            if(key === 'constructor'){
                continue;
            }
            server.addListener(key, clazz.prototype[key]);
        }
        Object.defineProperty(enhancedClazz.prototype, 'listen', {
            value: server.listen.bind(server),
        })
        return enhancedClazz;
    }

    addListener(methodName, handler){
        this.#methods.set(methodName, handler);
    }

    async listen(){
        await this.#channel.assertExchange(this.#resource, 'direct');
        for(const [method, handler] of this.#methods.entries()){
            const methodName = `${this.#resource}:${method}`;
            await this.#channel.assertQueue(methodName);
            await this.#channel.bindQueue(methodName, this.#resource, methodName);
            await this.#channel.consume(methodName, async (message) => {
                const [...args] = JSON.parse(message.content);
                const { replyTo, correlationId } = message.properties;
                const response = await handler(...args);
                const methodResponseQueue = RpcUtils.createClientQueue(this.#resource, replyTo);
                await this.#channel.publish(this.#resource, methodResponseQueue, Buffer.from(JSON.stringify(response || null)), { correlationId });
                await this.#channel.ack(message);
            }, {});
        }
    }
}

module.exports.RpcClient = RpcClient;
module.exports.RpcServer = RpcServer;