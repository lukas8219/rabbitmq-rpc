const SequenceNumber = require('./sequence-number');
const { RpcUtils } = require('./utils');

class RpcClient {
    #resource;
    #__inFlightObject = {}; //TODO: This would not perform well. What if there are some thousands of concurrent requests? Acessing large objects via indexing would cause a huge perf hit.
    #__assertedResponseQueue = false;
    #__identifier;
    #__seqNumber = 0;
    #__options = {}
    constructor(resource, amqpChannel, options){
        this.#resource = resource;
        this.amqpChannel = amqpChannel;
        this.#__identifier = `${SequenceNumber.generateHash(resource)}`;
        this.#__options = Object.assign({ timeout: 30000 }, options)
    }

    static create(clazz, amqpChannel, options){
        const client = new RpcClient(clazz.name, amqpChannel, options);
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
        const timeout = this.#__options.timeout;
        const signal = AbortSignal.timeout(timeout);
        return new Promise(async (resolve, reject) => {
            try {
                
                const methodName = `${this.#resource}:${method}`;
                const _id = `${Date.now()}#${++this.#__seqNumber}`;
                signal.onabort = () => reject(new Error(`${methodName}@${this.#__identifier}: request Id ${_id} timed out. Exceed limit ${this.#__options.timeout}ms`));
                this.#__inFlightMethod.insert(_id, resolve);
                await this.subscribeToResponse(methodName);
                await this.amqpChannel.publish(this.#resource, methodName, Buffer.from(JSON.stringify([...args])), { replyTo: this.#__identifier, correlationId: _id, headers: { 'rpc-expire-at': Date.now() + timeout } });
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
            const method = this.#__inFlightMethod.search(correlationId);
            if(!method){
                if((process.env.DEBUG || "").includes('rabbitmq-rpc')){
                    console.log(`debug: ${correlationId} not found for client ${this.#__identifier}`);
                    return this.amqpChannel.ack(message);
                }
                this.amqpChannel.nack(message);
                throw new Error(`Correlation ${correlationId} not found for identifier ${this.#__identifier} ${methodResponseQueue}`);
            }
            await method(JSON.parse(content));
            this.#__inFlightMethod.delete(correlationId);
            this.amqpChannel.ack(message);
        });
    }

    //TODO experiment better data structures for high concurrency scenarios
    get #__inFlightMethod(){
        const self = this.#__inFlightObject;
        return {
            search(correlation){
                return self[correlation];
            },
            insert(correlation, method){
                self[correlation] = method;
            },
            delete(correlation){
                delete self[correlation];
            },
            length(){
                return Object.keys(self).length;
            }
        }
    }
}


module.exports = RpcClient;