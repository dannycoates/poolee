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
      console.log("put succeeded");
    }
    else {
      console.log(response.statusCode)
      console.log(body)
    }
  }
)

```