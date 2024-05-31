class RpcUtils {
    static createClientQueue(resource, identifier){
        return `${resource}:client:${identifier}`;
    }
}

module.exports.RpcUtils = RpcUtils;