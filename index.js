const { RpcClient, RpcServer } = require('./src/rpc');
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

    const UserRpcServiceServer = RpcServer.create(UserRpcService, channel);
    const UserRpcServiceClient = RpcClient.create(UserRpcService, channel);

    const userRpcServiceClient = new UserRpcServiceClient();
    const serverRpcService = new UserRpcServiceServer();

    serverRpcService.listen();

    setInterval(async () => {
        const response = await userRpcServiceClient.fetchUsers(1);
        console.log('received response from user rpc', response);
    }, 500)
}

run();