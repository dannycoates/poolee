var assert = require("assert")
var RequestSet = require("../lib/request_set")

var node = {
	request: function () {}
}

function succeeding_request(options, data, cb) {
	return cb(null, {}, "foo")
}

function failing_request(options, data, cb) {
	return cb({
		message: "crap",
		reason: "ihateyou"
	})
}

function hangup_request(options, data, cb) {
	return cb({
		message: "hang up",
		reason: "socket hang up"
	})
}

function aborted_request(options, data, cb) {
	return cb({
		message: "aborted",
		reason: "aborted"
	})
}

var pool = {
	get_node: function () {
		return node
	},
	nodes: [node, node, node]
}

describe("RequestSet", function () {

	it("defaults attempt count to at least 2", function () {
		var r = new RequestSet({nodes: [1]}, {}, null, null)
		assert.equal(r.attempts, 2)
	})

	it("defaults attempt count to at most 5", function () {
		var r = new RequestSet({nodes: [1,2,3,4,5,6,7,8,9]}, {}, null, null)
		assert.equal(r.attempts, 5)
	})

	it("defaults attempt count to pool.nodes.length", function () {
		var r = new RequestSet({nodes: [1,2,3,4]}, {}, null, null)
		assert.equal(r.attempts, 4)
	})

	describe("request()", function () {

		it("calls the callback on success", function (done) {
			node.request = succeeding_request
			RequestSet.request(pool, {}, null, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})

		it("calls the callback on error", function (done) {
			node.request = failing_request
			RequestSet.request(pool, {}, null, function (err, res, body) {
				assert.equal(err.message, "crap")
				done()
			})
		})

		it("calls the callback with a 'no nodes' error when there's no nodes to service the request", function (done) {
			var p = {
				get_node: function () {},
				nodes: []
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err.message, "no nodes")
				done()
			})
		})

		it("retries hangups once", function (done) {
			var p = {
				i: 0,
				get_node: function () { return this.nodes[this.i++]},
				nodes: [{ request: hangup_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})

		it("retries hangups once then fails", function (done) {
			var p = {
				i: 0,
				get_node: function () { return this.nodes[this.i++]},
				nodes: [{ request: hangup_request }, { request: hangup_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err.reason, "socket hang up")
				done()
			})
		})

		it("retries aborts once", function (done) {
			var p = {
				i: 0,
				get_node: function () { return this.nodes[this.i++]},
				nodes: [{ request: aborted_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})

		it("retries aborts once then fails", function (done) {
			var p = {
				i: 0,
				get_node: function () { return this.nodes[this.i++]},
				nodes: [{ request: aborted_request }, { request: aborted_request }, { request: succeeding_request }]
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err.reason, "aborted")
				done()
			})
		})

		it("retries up to this.attempts times", function (done) {
			var p = {
				i: 0,
				get_node: function () { return this.nodes[this.i++]},
				nodes: [{ request: failing_request }, { request: failing_request }, { request: aborted_request }]
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err.reason, "aborted")
				done()
			})
		})

		it("retries up to the first success", function (done) {
			var p = {
				i: 0,
				get_node: function () { return this.nodes[this.i++]},
				nodes: [{ request: failing_request }, { request: failing_request }, { request: succeeding_request }, { request: failing_request }]
			}
			RequestSet.request(p, {}, null, function (err, res, body) {
				assert.equal(err, null)
				assert.equal(body, "foo")
				done()
			})
		})
	})
})
