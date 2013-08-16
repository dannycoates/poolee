# poolee

HTTP pool and load balancer for node.

[![Build Status](https://travis-ci.org/dannycoates/poolee.png)](https://travis-ci.org/dannycoates/poolee)

# Example

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

---

# API

## Pool

### new

```javascript
var Pool = require('poolee')
//...

var pool = new Pool(
  http                     // the http module to use (require('http') or require('https'))
  ,
  [ "127.0.0.1:1337"       // array of endpoints in "host:port" form
  , "127.0.0.1:1338"
  ]
  ,                        // options
  { maxPending: 1000       // maximum number of outstanding request to allow
  , maxSockets: 200        // max sockets per endpoint Agent
  , timeout: 60000         // request timeout in ms
  , resolution: 1000       // timeout check interval (see below)
  , keepAlive: false       // use an alternate Agent that does http keep-alive properly
  , ping: undefined        // health check url
  , pingTimeout: 2000      // ping timeout in ms
  , retryFilter: undefined // see below
  , retryDelay: 20         // see below
  , maxRetries: 5          // see below
  , name: undefined        // optional string
  , agentOptions: undefined// an object for passing options directly to the Http Agent
  }
)
```

###### maxPending

Once this threshold is reached, requests will return an error to the callback as a
signal to slow down the rate of requests.

###### resolution

Pending requests have their timeouts checked at this rate. If your timeout is 60000
and resolution is 1000, the request will timeout no later than 60999

###### keepAlive

The default http Agent does keep-alive in a stupid way. If you want it to work
how you'd expect it to set this to true.

###### retryFilter

All valid http responses aren't necessarily a "success". This function lets you
check the response before calling the request callback. Returning a "truthy" value
will retry the request.

For instance, we may want to always retry 500 responses by default:
```javascript
options.retryFilter = function (
    options  // the request.options
  , response // the http response object
  , body     // the response body
  ) {
  return response.statusCode === 500
}
```

If the returned value is `true` the next attempt will be delayed using exponential backoff;
if its `Number` it will delay the next attempt by that many ms (useful for `Retry-After` headers)

###### retryDelay

Pool uses exponential backoff when retrying requests. This value is a scaling factor of the
time (ms) to wait. Here's how it works:
```javascript
Math.random() * Math.pow(2, attemptNumber) * retryDelay
```
If `retryDelay` is 20, attemptNumber 1 (the first retry) will delay at most 40ms

###### maxRetries

The maximum number of attempts to make after the first request fails. This only
takes effect if maxRetries < pool size.

###### agentOptions

These options are passed directly to the underlying Agents used in the pool. This
is nice for passing options like `cert` and `key` that are required for client certificates.

###### ping

When an endpoint is unresponsive the pool will not use it for requests. The ping
url gives a downed endpoint a way to rejoin the pool. If an endpoint is marked unhealthy
and a ping url is given, the endpoint will make requests to its ping url until it gets
a 200 response, based on the `resolution` time.

If the ping url is undefined, the endpoint will never be marked unhealthy.


### pool.request

An http request. The pool sends the request to one of it's endpoints. If it
fails, the pool may retry the request on other endpoints until it succeeds or
reaches `options.attempts` number of tries. *When `data` is a Stream, only 1
attempt will be made*

###### Usage


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
  , headers: {}            // extra http headers to send
  , retryFilter: undefined // see below
  , attempts: pool.length  // or at least 2, at most options.maxRetries + 1
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

### pool.get

Just a synonym for `request`

### pool.put

Same arguments as `request` that sets `options.method = 'PUT'`. Nice for
putting :)

```javascript
pool.put('/tweet/me', 'Hello World!', function (error, response) {})
```

### pool.post

Same arguments as `request` that sets `options.method = 'POST'`

### pool.del

Same arguments as `request` that sets `options.method = 'DELETE'`


### Events

##### timing

Emits the request `duration` and `options` after each request

##### retrying

Emits the `error` of why a request is being retried

##### timeout

Emits the `request` when a request times out

##### health

Emits the `endpoint` when a node changes state between healthy/unhealthy
