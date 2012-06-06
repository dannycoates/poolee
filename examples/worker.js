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
