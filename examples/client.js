var Poolee = require('../')
  , http = require('http')
  , ms = require('ms') // converts a time to milliseconds
  , servers = [ '127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082' ]
  , pool = null

  // healthiest node, populated later on
  , active_node = null

pool = new Poolee(http, servers)

pool.on('retrying', function(error) {
  console.log(error.message);
})

console.log('fib(40) = ...calculating on worker.js...');
pool.request(
  { method: 'GET'
  , path: '/'
  }
, function (error, response, body) {
    if (error) {
      console.error(error.message)
      return
    }
    if (response.statusCode === 200) {
      console.log(body)

    } else {
      console.log(response.statusCode)
      console.log(body)
    }
  }
)
