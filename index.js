var inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    Endpoint = require('./lib/endpoint')(inherits, EventEmitter),
    RequestSet = require('./lib/request_set')

module.exports = require('./lib/pool')(inherits, EventEmitter, Endpoint, RequestSet)
