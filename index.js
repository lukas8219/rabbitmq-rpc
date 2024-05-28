const { RpcClient, RpcServer } = require('./src/rpc');
const amqplib = require('amqplib');

async function run(){
    const connection = await amqplib.connect('amqp://lucas:local@localhost:5672');
    const channel = await connection.createChannel();

    const rpcClient = new RpcClient('rpc-api', channel);

    const server = new RpcServer('rpc-api', channel);

    await server.addListener('do-something', console.log);
    await server.listen();

    const response = await rpcClient.call('do-something');    
}

run();