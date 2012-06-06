# poolee

HTTP pool and load balancer for node

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

# Pool

## request

An http request. The pool sends the request to one of it's endpoints. If it fails,
the pool may retry the request on other endpoints until it succeeds or reaches
`options.attempts` number of tries. *When `data` is a Stream, only 1 attempt will be made*

### Usage


The first argument may be a url path
If the callback has 3 arguments the full response body will be returned

```javascript
pool.request('/users/me', function (error, response, body) {})
```

The first argument may be an options object
Here's the default values:

```javascript
pool.request(
  { path: undefined        // the request path (required)
  , method: 'GET'
  , data: undefined        // request body, may be a string, buffer, or stream
  , retryFilter: undefined // see below
  , attempts: pool.length  // or at least 2, at most 5
  , retryDelay: 20         // retries wait with exponetial backoff times this number of ms
  , timeout: 60000         // ms to wait before timing out the request
  , encoding: 'utf8'       // response body encoding
  , stream: false          // stream instead of buffer response body
  }
  ,
  function (error, response, body) {}
)
```

The request body may be the second argument, instead of options.data (more useful
with `pool.post` and `pool.put`)

```javascript
pool.request(
  { path: '/foo' }
  , 'hi there'
  , function (error, response, body) {}
)
```

A callback with 2 arguments will stream the response and not buffer the response body

```javascript
pool.request('/foo', function (error, response) {
  response.pipe(somewhere)
})
```
