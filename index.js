var inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    Pinger = require('./lib/pinger')(inherits, EventEmitter),
    Endpoint = require('./lib/endpoint')(inherits, EventEmitter, Pinger),
    RequestSet = require('./lib/request_set')

module.exports = require('./lib/pool')(inherits, EventEmitter, Endpoint, RequestSet)
