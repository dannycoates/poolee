var assert = require("assert")
var EventEmitter = require("events").EventEmitter
var inherits = require('util').inherits
var http = require('http')
var https = require('https')
var Stream = require('stream')

var noop = function () {}

var Pinger = require('../lib/pinger')(inherits, EventEmitter)
var EndpointError = require('../lib/error')(inherits)
var Endpoint = require("../lib/endpoint")(inherits, EventEmitter, Pinger, EndpointError)

describe("Endpoint", function () {

	it("passes nothing to the Agent constructor when no agentOptions are given", function () {
		var e = new Endpoint(http, '127.0.0.1', 6969, { bogus: true })
		assert.equal(e.agent.options.bogus, undefined)
	})

	it("passes agentOptions to the underlying Agent (no keep-alive)", function () {
		var e = new Endpoint(http, '127.0.0.1', 6969, { agentOptions: { cert: 'foo', key: 'bar'}})
		assert.equal(e.agent.options.cert, 'foo')
		assert.equal(e.agent.options.key, 'bar')
	})

	it("passes agentOptions to the underlying Agent (keep-alive)", function () {
		var e = new Endpoint(http, '127.0.0.1', 6969, {keepAlive: true, agentOptions: { cert: 'foo', key: 'bar'}})
		assert.equal(e.agent.options.cert, 'foo')
		assert.equal(e.agent.options.key, 'bar')
	})

	it("passes agentOptions to the underlying Agent (keep-alive secure)", function () {
		var e = new Endpoint(https, '127.0.0.1', 6969, {keepAlive: true, agentOptions: { cert: 'foo', key: 'bar'}})
		assert.equal(e.agent.options.cert, 'foo')
		assert.equal(e.agent.options.key, 'bar')
	})

	//
	// unhealthy
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("unhealthy", function () {

		it("returns a 'unhealthy' error on request", function () {
			Endpoint.unhealthy().request({}, function (err) {
				assert.equal(err.reason, "unhealthy")
			})
		})

		it("is not healthy", function () {
			assert.equal(false, Endpoint.unhealthy().healthy)
		})
	})

	//
	// overloaded
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("overloaded", function () {
		it("returns a 'full' error on request", function () {
			Endpoint.overloaded().request({}, function (err) {
				assert.equal(err.reason, "full")
			})
		})

		it("is not healthy", function () {
			assert.equal(false, Endpoint.overloaded().healthy)
		})
	})

	//
	// request
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("request()", function () {

		it("sends Content-Length when data is a string", function (done) {
			var s = http.createServer(function (req, res) {
				assert.equal(req.headers["content-length"], 4)
				res.end("foo")
				s.close()
				done()
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969)
				e.request({path:'/foo', method: 'PUT', data: "ƒoo"}, noop)
			})
			s.listen(6969)
		})

		it("sends Content-Length when data is a buffer", function (done) {
			var s = http.createServer(function (req, res) {
				assert.equal(req.headers["content-length"], 4)
				res.end("foo")
				s.close()
				done()
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969)
				e.request({path:'/foo', method: 'PUT', data: Buffer("ƒoo")}, noop)
			})
			s.listen(6969)
		})

		it("pipes data to the request when it is a Stream", function (done) {
			var put = "ƒoo"
			var putStream = new Stream()
			var s = http.createServer(function (req, res) {
				var d = ''
				req.on('data', function (data) { d += data })
				req.on('end', function () {
					assert.equal(d, put)
					s.close()
					done()
				})
			})

			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969)
				e.request({path:'/foo', method: 'PUT', data: putStream}, noop)
				putStream.emit('data','ƒ')
				putStream.emit('data','o')
				putStream.emit('data','o')
				putStream.emit('end')
			})
			s.listen(6969)
		})

		it("times out and returns an error when the server fails to respond in time", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 30)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, function (err, response, body) {
					error = err
				})
				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "socket hang up")
					assert.equal(/request timed out$/.test(error.message), true)
					done()
				}, 40)
			})
			s.listen(6969)
		})

		it("times out and returns an error when the server response hasn't sent any data within the timeout", function (done) {
			this.timeout(0)
			var s = http.createServer(function (req, res) {
				res.writeHead(200)

				setTimeout(function () {
					res.write('foo')
				}, 10)

				setTimeout(function () {
					res.write('bar')
				}, 40)

			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 15, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "aborted")
					assert.equal(/response timed out$/.test(error.message), true)
					done()
				}, 250)
			})
			s.listen(6969)
		})

		it("emits a timeout event on timeout", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 30)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10})
				var fin = false
				e.on('timeout', function () {
					fin = true
				})
				e.request({path:'/foo', method: 'GET'}, noop)

				setTimeout(function () {
					s.close()
					assert.equal(fin, true)
					done()
				}, 60)
			})
			s.listen(6969)
		})

		it("removes the request from this.requests on timeout", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 30)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {keepAlive: true, timeout: 20, resolution: 10})
				var fin = false
				e.on('timeout', function () {
					fin = true
				})
				e.request({path:'/foo', method: 'GET'}, noop)
				e.request({path:'/foo', method: 'GET'}, noop)
				e.request({path:'/foo', method: 'GET'}, noop)

				setTimeout(function () {
					assert.equal(fin, true)
					assert.equal(Object.keys(e.requests).length, 0)
					s.close()
					done()
				}, 100)
			})
			s.listen(6969)
		})

		it("removes the request from this.requests on error", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 30)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "socket hang up")
					assert.equal(Object.keys(e.requests).length, 0)
					done()
				}, 50)
			})
			s.listen(6969)
		})

		it("removes the request from this.requests on aborted", function (done) {
			var s = http.createServer(function (req, res) {
				res.writeHead(200)
				res.write('foo')
				setTimeout(function () {
					req.connection.destroy()
				}, 10)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "aborted")
					assert.equal(Object.keys(e.requests).length, 0)
					done()
				}, 50)
			})
			s.listen(6969)
		})

		it("removes the request from this.requests on success", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 10)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error, null)
					assert.equal(Object.keys(e.requests).length, 0)
					done()
				}, 50)
			})
			s.listen(6969)
		})

		it("returns the whole body to the callback", function (done) {
			var s = http.createServer(function (req, res) {
				res.write("foo")
				setTimeout(function () {
					res.end("bar")
				}, 10)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10})
				var body
				e.request({path:'/foo', method: 'GET'}, function (err, response, b) {
					body = b
				})

				setTimeout(function () {
					s.close()
					assert.equal(body, "foobar")
					done()
				}, 50)
			})
			s.listen(6969)
		})

		it("buffers the response when callback has 3 arguments and options.stream is not true", function (done) {
			var s = http.createServer(function (req, res) {
				res.end("foo")
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10, maxPending: 1})
				e.request({path:'/ping', method: 'GET'}, function (err, response, body) {
					assert.equal(response.statusCode, 200)
					assert.equal(response.complete, true)
					s.close()
					done()
				})
			})
			s.listen(6969)
		})

		it("streams the response when callback has 2 arguments", function (done) {
			var s = http.createServer(function (req, res) {
				res.end("foo")
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10, maxPending: 1})
				e.request({path:'/ping', method: 'GET'}, function (err, response) {
					assert.equal(response.statusCode, 200)
					assert.equal(response.complete, false)
					s.close()
					done()
				})
			})
			s.listen(6969)
		})

		it("streams the response when options.stream is true", function (done) {
			var s = http.createServer(function (req, res) {
				res.end("foo")
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 20, resolution: 10, maxPending: 1})
				e.request({path:'/ping', method: 'GET', stream: true}, function (err, response, body) {
					assert.equal(response.statusCode, 200)
					assert.equal(response.complete, false)
					assert.equal(body, undefined)
					s.close()
					done()
				})
			})
			s.listen(6969)
		})
	})

	//
	// setPending
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("setPending()", function () {

		it("maintains the correct pending count when requestCount 'overflows'", function () {
			var e = new Endpoint(http, '127.0.0.1', 6969)
			e.successes = (Math.pow(2, 52) / 2) - 250
			e.failures = (Math.pow(2, 52) / 2) - 251
			e.filtered = 1
			e.requestCount = Math.pow(2, 52)
			e.setPending()
			assert.equal(e.pending, 500)
			assert.equal(e.requestCount, 500)
		})

		it("maintains the correct requestRate when requestCount 'overflows'", function () {
			var e = new Endpoint(http, '127.0.0.1', 6969)
			e.pending = 500
			e.requestRate = 500
			e.requestCount = Math.pow(2, 52)
			e.requestsLastCheck = e.requestCount - 500
			e.resetCounters()
			assert.equal(e.requestCount - e.requestsLastCheck, e.requestRate)
		})
	})

	//
	// resetCounters
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("resetCounters()", function () {

		it("sets successes, failures and filtered to 0", function () {
			var e = new Endpoint(http, '127.0.0.1', 6969)
			e.successes = (Math.pow(2, 52) / 2) - 250
			e.failures = (Math.pow(2, 52) / 2) - 251
			e.filtered = 1
			e.requestCount = Math.pow(2, 52)
			e.resetCounters()
			assert.equal(e.successes, 0)
			assert.equal(e.failures, 0)
			assert.equal(e.filtered, 0)
		})

		it("sets requestCount = pending", function () {
			var e = new Endpoint(http, '127.0.0.1', 6969)
			e.pending = 500
			e.requestRate = 400
			e.requestCount = Math.pow(2, 52)
			e.resetCounters()
			assert.equal(e.requestCount, 500)
		})

		it("sets requestsLastCheck = requestRate - pending", function () {
			var e = new Endpoint(http, '127.0.0.1', 6969)
			e.pending = 500
			e.requestRate = 600
			e.resetCounters()
			assert.equal(e.requestsLastCheck, 100)
		})
	})

	//
	// ready
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("ready()", function () {

		it('returns true when it is healthy and connected > pending with keepAlive on',
			function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {keepAlive: true})
				e.pending = 1
				e.agent.sockets[e.name] = [1,2]
				assert(e.ready())
			}
		)

		it('returns false when it is healthy and connected = pending with keepAlive on',
			function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {keepAlive: true})
				e.pending = 1
				e.agent.sockets[e.name] = [1]
				assert(!e.ready())
			}
		)

		it('returns true when it is healthy and pending = 0 with keepAlive off',
			function () {
				var e = new Endpoint(http, '127.0.0.1', 6969)
				e.pending = 0
				assert(e.ready())
			}
		)

		it('returns false when it is healthy and pending > 0 with keepAlive off',
			function () {
				var e = new Endpoint(http, '127.0.0.1', 6969)
				e.pending = 1
				assert(!e.ready())
			}
		)
	})

	//
	// setHealthy
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("setHealthy()", function () {

		it("calls pinger.start if transitioning from healthy to unhealthy", function (done) {
			var e = new Endpoint(http, '127.0.0.1', 6969, {ping: '/ping'})
			e.pinger.start = done
			e.setHealthy(false)
		})

		it("emits 'health' once when changing state from healthy to unhealthy", function (done) {
			var e = new Endpoint(http, '127.0.0.1', 6969, {ping: '/ping'})
			e.emit = function (name) {
				assert.equal(name, "health")
				done()
			}
			e.setHealthy(false)
		})

		it("emits 'health' once when changing state from unhealthy to healthy", function (done) {
			var e = new Endpoint(http, '127.0.0.1', 6969, {ping: '/ping'})
			e.emit = function (name) {
				assert.equal(name, "health")
				done()
			}
			e.healthy = false
			e.setHealthy(true)
		})
	})
})
