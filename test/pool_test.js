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

function FakeRequestSet() {}
FakeRequestSet.request = function () {}

function succeeding_request(pool, options, cb) {
	return cb(null, {}, "foo")
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

	describe("healthy_nodes()", function () {

		it("filters out unhealthy nodes from the result", function () {
			pool.nodes[0].healthy = false
			assert.equal(true, pool.healthy_nodes().every(function (n) {
				return n.healthy
			}))
		})
	})

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
				return cb(null, {}, "foo")
			}
			pool.request("/foo", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})

		it("defaults method to GET", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "GET")
				return cb(null, {}, "foo")
			}
			pool.request("/foo", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})

	describe("get()", function () {

		it("is an alias to request()", function () {
			assert.equal(pool.get, pool.request)
		})
	})

	describe("put()", function () {

		it("sets the options.method to PUT", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "PUT")
				return cb(null, {}, "foo")
			}
			pool.put("/foo", "bar", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})

	describe("post()", function () {

		it("sets the options.method to POST", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "POST")
				return cb(null, {}, "foo")
			}
			pool.post("/foo", "bar", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})

	describe("del()", function () {

		it("sets the options.method to DELETE", function (done) {
			FakeRequestSet.request = function (pool, options, cb) {
				assert.equal(options.method, "DELETE")
				return cb(null, {}, "foo")
			}
			pool.del("/foo", function (e, r, b) {
				assert.equal(b, "foo")
				done()
			})
		})
	})
})
