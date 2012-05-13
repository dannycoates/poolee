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

function succeeding_request(pool, options, data, cb) {
	return cb(null, {}, "foo")
}

function failing_request(pool, options, data, cb) {
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

	})
})
