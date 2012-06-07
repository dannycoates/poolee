# poolee

HTTP pool and load balancer for node. Requests are sent to the healthiest node.
Exposes node health, timeout, and retry events.

# Usage

```javascript

var Pool = require("poolee")
var http = require("http")

var servers =
  ["127.0.0.1:8886"
  ,"127.0.0.1:8887"
  ,"127.0.0.1:8888"
  ,"127.0.0.1:8889"]

var postData = '{"name":"Danny Coates"}'

var pool = new Pool(http, servers, options)

pool.request(
  { method: "PUT"
  , path: "/users/me"
  }
, postData
, function (error, response, body) {
    if (error) {
      console.error(error.message)
      return
    }
    if(response.statusCode === 201) {
      console.log("put succeeded")
    }
    else {
      console.log(response.statusCode)
      console.log(body)
    }
  }
)
```

## pool.request

An http request. The pool sends the request to one of it's endpoints. If it
fails, the pool may retry the request on other endpoints until it succeeds or
reaches `options.attempts` number of tries. *When `data` is a Stream, only 1
attempt will be made*

### Usage


The first argument may be a url path.
If the callback has 3 arguments the full response body will be returned

```javascript
pool.request('/users/me', function (error, response, body) {})
```

The first argument may be an options object.
Here's the default values:

```javascript
pool.request(
  { path: undefined        // the request path (required)
  , method: 'GET'
  , data: undefined        // request body, may be a string, buffer, or stream
  , retryFilter: undefined // see below
  , attempts: pool.length  // or at least 2, at most 5
  , retryDelay: 20         // retries wait with exponential backoff times this number of ms
  , timeout: 60000         // ms to wait before timing out the request
  , encoding: 'utf8'       // response body encoding
  , stream: false          // stream instead of buffer response body
  }
  ,
  function (error, response, body) {}
)
```

The request body may be the second argument, instead of options.data (more
useful with `pool.post` and `pool.put`)

```javascript
pool.request(
  { path: '/foo' }
  , 'hi there'
  , function (error, response, body) {}
)
```

A callback with 2 arguments will stream the response and not buffer the 
response body.

```javascript
pool.request('/foo', function (error, response) {
  response.pipe(somewhere)
})
```

### pool.request.get

Just a synonym for `request`

### pool.request.put

Same arguments as `request` that sets `options.method = 'PUT'`. Nice for 
putting :)

```javascript
pool.put('/tweet/me', 'Hello World!', function (error, response) {})
```

### pool.request.post

Same arguments as `request` that sets `options.method = 'POST'`

### pool.request.del

Same arguments as `request` that sets `options.method = 'DELETE'`

---

# Advanced

## Make a pool
```js
var pool = new Poolee(http, servers, options)
```

`servers`: array of strings formatted like 'ip:port'

`options`: defaults and explanations below

```js
// options
{
  // number of pending requests allowed
  maxPending: 1000

  // ping path. (default = no ping checks)
, ping: null

, retryFilter: function (response) { 
    // return true to reject response and retry
  }

  // number in milliseconds
, retryDelay: 20

  // optional string name
, name: null
}
```

### Events emitted by `pool`:
```js
pool.on('health', function(messageString) {
  // message string of of the form:
  // "127.0.0.1:8888 health: true"
  // or
  // "127.0.0.1:8888 health: false"
})

pool.on('timeout', function(url) {
  // where url is a ip+port+path combination for the timed-out request
})

pool.on('retrying', function(error) { })

pool.on('timing', function(time, options) {
  // `time`: the time the latest request took to complete
  // `options`: options used to send the request
})
```


### Get the healthiest node
    var node = pool.get_node()

Attached to `node`:

    // numeric composite of latency, # open sockets, # active requests
    // node.busyness();

    // node.ip;
    // node.port;
    // node.name = node.ip + ':' + node.port;

### Events emitted by `node`
```js
node.on('health', function(self) {
  // `self` has all the same properties as `node`
})
```

### Example

Note that this example should fail, because there won't be any nodes running.
You can also see this code in 
[`examples/`](https://github.com/dannycoates/poolee/tree/master/examples).

#### `client.js`
```js
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
```

Run this before the above script, then see what happens.

#### `worker.js`
```js
// An http server that does things for you!
// Do not write your fib server this way, instead use
// https://gist.github.com/2018811 which this code is based on.
var http = require('http')
var PORT = process.argv[2]

function fib(n) {
  if (n < 2) {
    return 1
  } else {
    return fib(n - 2) + fib(n - 1)
  }
}

var server = http.createServer(function(req, res) {
  res.writeHead(200)
  res.end(fib(40) + "\n")
})
server.listen(PORT)
console.log("worker.js online at http://localhost:" + PORT)
```

To see a pool that is 100% healthy:

```sh
node ./worker.js 8080 &
node ./worker.js 8081 &
node ./worker.js 8082 &

echo "running client.js ..."
node ./client.js
```

## Running tests
```sh
npm -g install mocha
mocha
```
