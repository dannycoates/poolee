var argv = require('optimist').argv
var http = require('http')
var url = require('url')

var i = 0
var port = argv.port

function respond(res) {
	res.writeHead(200, {'Content-Type': 'text/plain'})
	res.end(port + ":" + (i++))
}

http.createServer(
	function (req, res) {
		var q = url.parse(req.url, true)
		var delay = q.query ? +q.query.delay : 0
		if (delay) {
			setTimeout(
				function () {
					respond(res)
				}
			, delay
			)
		}
		else {
			respond(res)
		}
	}
).listen(port, '127.0.0.1')
