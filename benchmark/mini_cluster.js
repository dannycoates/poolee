var spawn = require('child_process').spawn
var http = require('http')
var argv = require('optimist').argv
var Pool = require('../index')

var instances = argv.n
var start = argv.start

console.log("starting " + instances + " servers. starting at port " + start)

var exited = 0
function done(code) {
	exited++
	if (exited === instances) {
		process.exit(0)
	}
}

var children = []
var nodes = []

function create(i, port) {
	console.log("spawning server on port " + port)
	var p = spawn
		( 'node'
		, [ 'mini_server.js'
			, '--port=' + port
			]
		)
	p.stdout.on('data', function (data) {
		console.log(data.toString())
	})
	p.stderr.on('data', function (data) {
		console.log('\t\033[31m' + data.toString() + '\033[39m')
	})
	p.on('exit', done)
	children.push(p)
	nodes.push('127.0.0.1:' + port)
}

for (var i = 0; i < instances; i++) {
	create(i, start + i)
}

var pool = new Pool(http, nodes, {maxPending: 100 })
pool.on('timing', function (time, op) {
	if (!op.success) {
		console.error('\033[31m' + time + '\033[39m')
	}
	// else {
	// 	console.error(time)
	// }
})
var x = 0
var start = Date.now()
var r = 10000
var a = r
var delay = 0 + Math.floor(Math.random() * 10)

function result(error, response, body) {
		if (error) {
			console.error('\033[31m' + error.reason + '\033[39m')
			r--
		}
		else {
			x++
			//console.error(pool.nodes.map(function (n) { return n.requestRate }))
		}
		if (x % 1000 === 0) {//if (x === r) {
			console.error(pool.nodes.map(function (n) { return n.requestRate }))
			console.error((a - r) + " failed")
			console.error(Date.now() - start)
			//children.forEach(function (c) { c.kill() })
		}
	}

setInterval(function () {
	for (var i = 0; i < 5; i++) {
		pool.get({ path: "/?delay=" + delay, attempts: 10, retryDelay: 50 }, result)
	}
}, 1)

