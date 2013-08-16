var inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    Pinger = require('./lib/pinger')(inherits, EventEmitter),
    EndpointError = require('./lib/error')(inherits),
    Endpoint = require('./lib/endpoint')(inherits, EventEmitter, Pinger, EndpointError),
    RequestSet = require('./lib/request_set')

module.exports = require('./lib/pool')(inherits, EventEmitter, Endpoint, RequestSet)
