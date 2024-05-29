# Rabbit RPC

Pet Project to implement RPC-based Services using RabbitMQ as back-bone. This aims to present an abstraction where you can code as simple classes.


## Examples
Examples in `examples` folder

### Service
```javascript
class UserService {
    constructor(repository){
        this.repository = repository;
    }

    async listUsers(queryParameters){
        return this.repository.list(queryParameters);
    }
}
```

### Client
```javascript
const { RpcClient } = require('./rpc');
const { UserService } = require('./src/services/user-service');
const UserServiceRpcClient = RpcClient.create(UserService, amqpChannel); //Ugly
const userServiceRpc = new UserServiceRpc(); //Make the constructors params optional?

const users = await userServiceRpc.listUsers({ name: { $eq: 'Lucas' } });
```

### Server
```javascript
const { RpcServer } = require('./rpc');
const { UserService } = require('./src/services/user-service');
const repository = require('./src/repository/user-repository');
const UserServiceRpcServer = RpcServer.create(UserService, amqpChannel);
const userServiceRpcServer = new UserServiceRpcServer(repository);

userServiceRpcServer.listen();
```
