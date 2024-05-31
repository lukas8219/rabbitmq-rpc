const { promisify } = require('util');
const { RpcClient, RpcServer } = require('../src/rpc');
const amqplib = require('amqplib');

//util to bottleneck server
const sleep = promisify(setTimeout);

class UserRpcService {

    async fetchUsers(_id){
        await sleep(5000);
        if(_id === 1){
            return { name: 'Lucas'}
        }
        return { error: 404 }
    }
}

async function run(){
    const connection = await amqplib.connect('amqp://lucas:local@localhost:5672');
    const channel = await connection.createChannel();

    const clientNUmber = Number(process.argv[3])
    const serverNumber = Number(process.argv[4]);

    new Array(isNaN(clientNUmber) ? 1 : clientNUmber).fill(1).forEach(() => runClient(channel));
    new Array(isNaN(serverNumber) ? 1 : serverNumber).fill(1).forEach(() => runServer(channel));    
}

async function runServer(amqpChannel){
    const UserRpcServiceServer = RpcServer.create(UserRpcService, amqpChannel);
    const serverRpcService = new UserRpcServiceServer();
    serverRpcService.listen();
}

async function runClient(amqpChannel){
    const UserRpcServiceClient = RpcClient.create(UserRpcService, amqpChannel, { timeout: 1000 });

    const userRpcServiceClient = new UserRpcServiceClient();

    setInterval(async () => {
        const response = await userRpcServiceClient.fetchUsers(1);
    }, 1000)
}

run();