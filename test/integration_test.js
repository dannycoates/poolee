var assert = require("assert")
var Pool = require('../index')
var http = require('http')

var noop = function () {}

describe('Pool', function () {
	var pool

	beforeEach(function () {
		pool = new Pool(http, ['127.0.0.1:6969'])
	})

	//
	// request
	//
	//////////////////////////////////////////////////////////////////////////////

	describe("request()", function () {

		it("passes options all the way to the endpoint request", function (done) {
			var s = http.createServer(function (req, res) {
				res.end("foo")
				s.close()
			})
			s.on('listening', function () {
				pool.request({
					path: '/foo',
					method: 'GET',
					ca: 'bar.ca'
				}, null, function (e, r, b) {
					done()
				})
				var req = pool.get_node().requests[0]
				assert.equal(req.options.ca, 'bar.ca')
			})
			s.listen(6969)
		})
	})
})
