const { RpcUtils } = require('./utils');

/* TODO LIST
- We should support timeouts
- Improve reliability for failed scenarios
*/

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

module.exports = RpcServer;