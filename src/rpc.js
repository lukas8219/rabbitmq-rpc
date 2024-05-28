class RpcClient {
    #resource;
    #__inFlight = {};
    #__assertedMethodNames = new Set();
    constructor(resource, amqpChannel){
        this.#resource = resource;
        this.amqpChannel = amqpChannel;
    }

    static create(clazz){
    }

    async call(methodName, ...args){
        return new Promise(async (resolve) => {
            const _id = `${Date.now()}`;
            const argsWId = [_id, ...args];
            this.#__inFlight[_id] = resolve;
            await this.subscribeToResponse(methodName);
            await this.amqpChannel.publish(this.#resource, methodName, Buffer.from(JSON.stringify(argsWId)));
        })
    }

    async subscribeToResponse(methodName) {
        if(this.#__assertedMethodNames.has(methodName)){
            return;
        }
        this.#__assertedMethodNames.add(methodName);
        //try catch and remove if fail
        await this.amqpChannel.assertExchange(this.#resource, 'direct');
        await this.amqpChannel.assertQueue(`${methodName}:response`, { exclusive: true });
        return this.amqpChannel.consume(`${methodName}:response`, async (message) => {
            const [_id, ...args] = JSON.parse(message.body);
            await this.#__inFlight[_id](...args);
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

    static create(clazz){

    }

    addListener(methodName, handler){
        this.#methods.set(methodName, handler);
    }

    async listen(){
        await this.#channel.assertExchange(this.#resource, 'direct');
        for(const [method, handler] of this.#methods.entries()){
            await this.#channel.assertQueue(method);
            await this.#channel.consume(method, async (message) => {
                const response = await handler(message);
                await this.#channel.publish(this.#resource, `${method}:response`, Buffer.from(JSON.stringify(response)));
                awaitthis.#channel.ack(message);
            }, {});
        }
    }
}

class UserRpcService {
    #rpcClient;
    constructor(rpcClient) {
        this.#rpcClient = rpcClient;
    }

    fetchUsers(){
        return this.#rpcClient.call('fetch-users');
    }
}

module.exports.RpcClient = RpcClient;
module.exports.RpcServer = RpcServer;