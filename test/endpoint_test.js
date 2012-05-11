var assert = require("assert")
var EventEmitter = require("events").EventEmitter
var inherits = require('util').inherits
var http = require('http')

var noop = function () {}


var Endpoint = require("../lib/endpoint")(inherits, EventEmitter)

describe("Endpoint", function () {

	it("starts health checks when a checkInterval is given", function (done) {
		var e = new Endpoint(http, '127.0.0.1', 6969, { checkInterval: 100 })
		setTimeout(function () {
			assert(e.healthTid)
			assert.equal(e.healthy, false)
			done()
		}, 1000)
	})

	describe("request()", function () {

		it("times out and returns an error when the server fails to respond in time", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 300)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 200, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, null, function (err, response, body) {
					error = err
				})
				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "socket hang up")
					done()
				}, 400)
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
				}, 300)

			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 200, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, null, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "aborted")
					done()
				}, 400)
			})
			s.listen(6969)
		})

		it("emits a timeout event on timeout", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 300)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 200, resolution: 10})
				var fin = false
				e.on('timeout', function () {
					fin = true
				})
				e.request({path:'/foo', method: 'GET'}, null, noop)

				setTimeout(function () {
					s.close()
					assert.equal(fin, true)
					done()
				}, 400)
			})
			s.listen(6969)
		})

		it("removes the request from this.requests on error", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.end("foo")
				}, 300)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 200, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, null, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "socket hang up")
					assert.equal(Object.keys(e.requests).length, 0)
					done()
				}, 400)
			})
			s.listen(6969)
		})

		it("removes the request from this.requests on aborted", function (done) {
			var s = http.createServer(function (req, res) {
				setTimeout(function () {
					res.writeHead(200)
					res.write('foo')
					req.connection.destroy()
				}, 10)
			})
			s.on('listening', function () {
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 200, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, null, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error.reason, "aborted")
					assert.equal(Object.keys(e.requests).length, 0)
					done()
				}, 400)
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
				var e = new Endpoint(http, '127.0.0.1', 6969, {timeout: 200, resolution: 10})
				var error
				e.request({path:'/foo', method: 'GET'}, null, function (err, response, body) {
					error = err
				})

				setTimeout(function () {
					s.close()
					assert.equal(error, null)
					assert.equal(Object.keys(e.requests).length, 0)
					done()
				}, 400)
			})
			s.listen(6969)
		})
	})
})
