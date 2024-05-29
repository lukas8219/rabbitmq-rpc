class RpcClient {
    #resource;
    #__inFlight = {};
    #__assertedMethodNames = new Set();
    #__identifier = `${Date.now()}`;
    constructor(resource, amqpChannel){
        this.#resource = resource;
        this.amqpChannel = amqpChannel;
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
        return new Promise(async (resolve) => {
            const methodName = `${this.#resource}:${method}`;
            const _id = `${Date.now()}`;
            this.#__inFlight[_id] = resolve;
            await this.subscribeToResponse(methodName);
            //TODO: Should we dynamically create the Queue?
            await this.amqpChannel.publish(this.#resource, methodName, Buffer.from(JSON.stringify([...args])), { replyTo: this.#__identifier, correlationId: _id });
        })
    }

    async subscribeToResponse(methodName) {
        if(this.#__assertedMethodNames.has(methodName)){
            return;
        }
        this.#__assertedMethodNames.add(methodName);

        //TODO: try catch and remove if fail
        const methodResponseQueue = `${methodName}:response:${this.#__identifier}`;
        await this.amqpChannel.assertExchange(this.#resource, 'direct');
        await this.amqpChannel.assertQueue(methodName);
        await this.amqpChannel.bindQueue(methodName, this.#resource, methodName);

        await this.amqpChannel.assertQueue(methodResponseQueue, { exclusive: true });
        await this.amqpChannel.bindQueue(methodResponseQueue, this.#resource, methodResponseQueue);
        return this.amqpChannel.consume(methodResponseQueue, async (message) => {
            const { properties: { correlationId }, content } = message;
            await this.#__inFlight[correlationId](JSON.parse(content));
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
            await this.#channel.consume(methodName, async (message) => {
                const [...args] = JSON.parse(message.content);
                const { replyTo, correlationId } = message.properties;
                const response = await handler(...args);
                const methodResponseQueue = `${methodName}:response:${replyTo}`;
                await this.#channel.publish(this.#resource, methodResponseQueue, Buffer.from(JSON.stringify(response || null)), { correlationId });
                await this.#channel.ack(message);
            }, {});
        }
    }
}

module.exports.RpcClient = RpcClient;
module.exports.RpcServer = RpcServer;