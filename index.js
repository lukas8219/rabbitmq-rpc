const { RpcClient, RpcServer } = require('./src/rpc');
const amqplib = require('amqplib');

async function run(){
    const connection = await amqplib.connect('amqp://lucas:local@localhost:5672');
    const channel = await connection.createChannel();

    const rpcClient = new RpcClient('rpc-api', channel);
    const server = new RpcServer('rpc-api', channel);

    await server.addListener('do-something', (message, someId) => console.log('message is', message, someId));
    await server.addListener('fetch-some-data', (id) => ({ id, timestamp: Date.now() }))
    server.listen();

    setInterval(async () => {
        const response = await rpcClient.call('fetch-some-data', '12331');
        console.log('response is', response);
    });
}

run();