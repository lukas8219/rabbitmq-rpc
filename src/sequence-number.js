const { randomBytes } = require('crypto');

let index = 0;
module.exports = class SequenceNumber {
    //TODO improve this hash collision
    static generateHash() {
        return `${Date.now()}#${randomBytes(8).toString('hex')}${++index}`;
    }
}