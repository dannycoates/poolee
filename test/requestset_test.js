var assert = require("assert")
var RequestSet = require("../lib/request_set")

var node = {
	request: function () {}
}

var unhealthy = {
	request: function (options, callback) { callback({ message: 'no nodes'}) }
}

function succeeding_request(options, cb) {
	return cb(null, {}, "foo")
}

function failing_request(options, cb) {
	return cb({
		message: "crap",
		reason: "ihateyou"
	})
}

function hangup_request(options, cb) {
	return cb({
		message: "hang up",
		reason: "socket hang up"
	})
}

function aborted_request(options, cb) {
	return cb({
		message: "aborted",
		reason: "aborted"
	})
}

var pool = {
	options: { maxRetries: 5 },
	get_node: function () {
		return node
	},
	onRetry: function () {},
	length: 3
}

describe("RequestSet", function () {

	it("defaults attempt count to at least 2", function () {
		var r = new RequestSet({length: 1, options: { maxRetries: 5 }}, {}, null)
		assert.equal(r.attempts, 2)
	})

	it("defaults attempt count to at most maxRetries + 1", function () {
		var r = new RequestSet({length: 9, options: { maxRetries: 4 }}, {}, null)
		assert.equal(r.attempts, 5)
	})

	it("defaults attempt count to pool.length", function () {
		var r = new RequestSet({length: 4, options: { maxRetries: 5 }}, {}, null)
		assert.equal(r.attempts, 4)
	})

	describe("request()", function () {

		it("calls the callback on success", function (done) {
			node.request = succeeding_request
			RequestSet.request(pool, {}, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})

		it("calls the callback on error", function (done) {
			node.request = failing_request
			RequestSet.request(pool, {}, function (err, res, body) {
				assert.equal(err.message, "crap")
				done()
			})
		})

		it("calls the callback with a 'no nodes' error when there's no nodes to service the request", function (done) {
			var p = {
				options: { maxRetries: 5 },
				get_node: function () { return unhealthy },
				length: 0,
				onRetry: function () {}
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err.message, "no nodes")
				done()
			})
		})

		it("retries hangups once", function (done) {
			var p = {
				i: 0,
				options: { maxRetries: 5 },
				get_node: function () { return this.nodes[this.i++]},
				onRetry: function () {},
				length: 2,
				nodes: [{ request: hangup_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})

		it("retries hangups identically to other requests then fails", function (done) {
			var p = {
				i: 0,
				options: { maxRetries: 5 },
				get_node: function () { return this.nodes[this.i++]},
				onRetry: function () {},
				length: 3,
				nodes: [{ request: hangup_request }, { request: hangup_request }, { request: hangup_request }, { request: hangup_request }, { request: hangup_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err.reason, "socket hang up")
				done()
			})
		})

		it("retries aborts once", function (done) {
			var p = {
				i: 0,
				options: { maxRetries: 5 },
				get_node: function () { return this.nodes[this.i++]},
				onRetry: function () {},
				length: 2,
				nodes: [{ request: aborted_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})

		it("retries aborts identically to other requests then fails", function (done) {
			var p = {
				i: 0,
				options: { maxRetries: 5 },
				get_node: function () { return this.nodes[this.i++]},
				onRetry: function () {},
				length: 3,
				nodes: [{ request: aborted_request }, { request: aborted_request }, { request: aborted_request }, { request: aborted_request}, { request: aborted_request}, { request: aborted_request} ]
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err.reason, "aborted")
				done()
			})
		})

		it("retries up to this.attempts times", function (done) {
			var p = {
				i: 0,
				options: { maxRetries: 5 },
				get_node: function () { return this.nodes[this.i++]},
				onRetry: function () {},
				length: 3,
				nodes: [{ request: failing_request }, { request: failing_request }, { request: aborted_request }]
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err.reason, "aborted")
				done()
			})
		})

		it("retries up to the first success", function (done) {
			var p = {
				i: 0,
				options: { maxRetries: 5 },
				get_node: function () { return this.nodes[this.i++]},
				onRetry: function () {},
				length: 4,
				nodes: [{ request: failing_request }, { request: failing_request }, { request: succeeding_request }, { request: failing_request }]
			}
			RequestSet.request(p, {}, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})
	})
})
