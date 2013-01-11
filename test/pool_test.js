var assert = require("assert")
var EventEmitter = require("events").EventEmitter
var inherits = require('util').inherits

var noop = function () {}

var http = {
	request: noop,
	Agent: noop
}

function FakeEndpoint() {}
inherits(FakeEndpoint, EventEmitter)
FakeEndpoint.prototype.pending = 1
FakeEndpoint.prototype.busyness = function () { return 1 }
FakeEndpoint.prototype.connected = function () { return 0 }
FakeEndpoint.prototype.ready = function () { return false }
var overloaded = new FakeEndpoint()
FakeEndpoint.overloaded = function () { return overloaded }
var unhealthy = new FakeEndpoint()
FakeEndpoint.unhealthy = function () { return unhealthy }

function FakeRequestSet() {}
FakeRequestSet.request = function () {}

function succeeding_request(pool, options, cb) {
	return cb(null, { socket: { _requestCount: 2 }}, "foo")
}

function succeeding_request_not_reused(pool, options, cb) {
	return cb(null, { socket: {}}, "foo")
}

function failing_request(pool, options, cb) {
	return cb({
		message: "crap",
		reason: "ihateyou"
	})
}

var Pool = require("../lib/pool")(inherits, EventEmitter, FakeEndpoint, FakeRequestSet)

describe('Pool', function () {
	var pool

	beforeEach(function () {
		pool = new Pool(http, ['127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082'])
	})

	it("throws an Error if constructed with no nodes", function () {
		assert.throws(
			function () {
				var p = new Pool()
			}
		)
	})

	it("throws an Error when the node list is invalid", function () {
		assert.throws(
			function () {
				var p = new Pool(http, ["foo_bar"])
			}
		)
	})

	it("throws an Error when http is invalid", function () {
		assert.throws(
			function () {
				var p = new Pool({}, ["127.0.0.1:8080"])
			}
		)
	})

	it("sets this.length to this.nodes.length", function () {
		var p = new Pool(http, ['127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082'])
		assert.equal(p.length, 3)
	})

	//
	// healthy_nodes
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("healthy_nodes()", function () {

		it("filters out unhealthy nodes from the result", function () {
			pool.nodes[0].healthy = false
			assert.equal(true, pool.healthy_nodes().every(function (n) {
				return n.healthy
			}))
		})
	})

	//
	// get_node
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("get_node()", function () {

		it("returns the 'overloaded' endpoint when totalPending > maxPending", function () {
			var p = new Pool(http, ['127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082'], { maxPending: 30 })
			p.nodes.forEach(function (n) { n.pending = 10 })
			assert.equal(p.get_node(), overloaded)
		})

		it("returns the 'unhealthy' endpoint when no nodes are healthy", function () {
			var p = new Pool(http, ['127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082'])
			p.nodes.forEach(function (n) { n.healthy = false })
			assert.equal(p.get_node(), unhealthy)
		})

		it('returns a "ready" node when one is available', function () {
			var p = new Pool(http, ['127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082'])
			var n = p.nodes[0]
			n.ready = function () { return true }
			assert.equal(p.get_node(), n);
		})

		it('returns a healthy node when none are "ready"', function () {
			var p = new Pool(http, ['127.0.0.1:8080', '127.0.0.1:8081', '127.0.0.1:8082'])
			p.nodes[0].healthy = false
			p.nodes[1].healthy = false
			p.nodes[2].healthy = true
			assert(p.get_node().healthy);
		})
	})

	//
	// request
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("request()", function () {

		it("calls callback with response on success", function (done) {
			FakeRequestSet.request = succeeding_request
			pool.request({}, null, function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})

		it("calls callback with error on failure", function (done) {
			FakeRequestSet.request = failing_request
			pool.request({}, null, function (e, r, b) {
				assert(e.message, "crap")
				done()
			})
		})

		it("emits timing on success", function (done) {
			FakeRequestSet.request = succeeding_request
			pool.on('timing', function () {
				done()
			})

			pool.request({}, null, noop)
		})

		it("emits timing on failure", function (done) {
			FakeRequestSet.request = failing_request
			pool.on('timing', function () {
				done()
			})

			pool.request({}, null, noop)
		})

		it("sets the reused field of options to true when the socket is reused", function (done) {
			FakeRequestSet.request = succeeding_request
			pool.on('timing', function (interval, options) {
				assert(options.reused)
				done()
			})

			pool.request({}, null, noop)
		})

		it("sets the reused field of options to false when the socket isn't reused", function (done) {
			FakeRequestSet.request = succeeding_request_not_reused
			pool.on('timing', function (interval, options) {
				assert(!options.reused)
				done()
			})

			pool.request({}, null, noop)
		})

		it("allows the data parameter to be optional", function (done) {
			FakeRequestSet.request = succeeding_request
			pool.request({}, function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})

		it("allows the options parameter to be a path string", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.path, "/foo")
				return cb(null, {socket:{}}, "foo")
			}
			pool.request("/foo", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})

		it("defaults method to GET", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "GET")
				return cb(null, {socket:{}}, "foo")
			}
			pool.request("/foo", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})

		it("defaults options.stream to true when callback.length is 2", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.stream, true)
				return cb(null, {socket:{}})
			}
			pool.request("/foo", function (e, r) {
				done()
			})
		})

		it("defaults options.stream to false when callback.length is 3", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.stream, false)
				return cb(null, {socket:{}})
			}
			pool.request("/foo", function (e, r, b) {
				done()
			})
		})
	})

	//
	// get
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("get()", function () {

		it("is an alias to request()", function () {
			assert.equal(pool.get, pool.request)
		})
	})

	//
	// put
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("put()", function () {

		it("sets the options.method to PUT", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "PUT")
				return cb(null, {socket:{}}, "foo")
			}
			pool.put("/foo", "bar", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})

	//
	// post
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("post()", function () {

		it("sets the options.method to POST", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "POST")
				return cb(null, {socket:{}}, "foo")
			}
			pool.post("/foo", "bar", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})

	//
	// del
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("del()", function () {

		it("sets the options.method to DELETE", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "DELETE")
				return cb(null, {socket:{}}, "foo")
			}
			pool.del("/foo", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})
})
