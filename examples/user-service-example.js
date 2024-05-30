const { RpcClient, RpcServer } = require('../src/rpc');
const amqplib = require('amqplib');

class UserRpcService {

    fetchUsers(_id){
        if(_id === 1){
            return { name: 'Lucas'}
        }
        return { error: 404 }
    }
}

async function run(){
    const connection = await amqplib.connect('amqp://lucas:local@localhost:5672');
    const channel = await connection.createChannel();

    new Array(Number(process.argv[3]) || 1).fill(1).forEach(() => runClient(channel));
    new Array(Number(process.argv[4]) || 1).fill(1).forEach(() => runServer(channel));    
}

async function runServer(amqpChannel){
    const UserRpcServiceServer = RpcServer.create(UserRpcService, amqpChannel);
    const serverRpcService = new UserRpcServiceServer();
    serverRpcService.listen();
}

async function runClient(amqpChannel){
    const UserRpcServiceClient = RpcClient.create(UserRpcService, amqpChannel);

    const userRpcServiceClient = new UserRpcServiceClient();

    setInterval(async () => {
        const response = await userRpcServiceClient.fetchUsers(1);
        console.log('received response from user rpc', response);
    }, 100)
}

run();