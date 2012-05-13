module.exports = function (inherits, EventEmitter) {
	var MAX_COUNT = Math.pow(2, 31) // largest smi value
	var clock = Date.now()
	setInterval(function () { clock = Date.now() }, 10)
	function noop() { return false }

	//
	// http: either require('http') or require('https')
	// ip: host ip
	// port: host port
	// options: {
	//   path: ping path (/ping)
	//   method: ping method (GET)
	//   maxPending: number of requests pending before returning an error (500)
	//   checkInterval: ping interval in ms (0 = no checks)
	//   maxSockets: max concurrent open sockets (20)
	//   timeout: request timeout in ms (60000)
	//   resolution: how often timeouts are checked in ms (1000)
	// }
	function Endpoint(http, ip, port, options) {
		var self = this
		options = options || {}

		this.http = http
		this.ip = ip
		this.port = port
		this.healthy = true
		this.name = this.ip + ':' + this.port
		this.address = this.ip

		this.agent = new http.Agent()
		this.agent.maxSockets = options.maxSockets || 20
		this.agent.sockets[this.name] = []
		this.agent.requests[this.name] = []

		this.requests = {}
		this.requestCount = 0
		this.requestsLastCheck = 0
		this.requestRate = 0
		this.pending = 0
		this.successes = 0
		this.failures = 0

		this.maxPending = options.maxPending || 500
		this.timeout = options.timeout || (60 * 1000)
		this.resolution = options.resolution || 1000
		this.timeoutCheck =
			function () {
				var expireTime = clock - self.timeout
				Object.keys(self.requests).forEach(
					function (name) {
						var r = self.requests[name]
						if (r.lastTouched <= expireTime) {
							self.emit("timeout", r)
							r.abort()
						}
					}
				)
				self.requestRate = self.requestCount - self.requestsLastCheck
				self.requestsLastCheck = self.requestCount
			}
		setInterval(this.timeoutCheck, this.resolution)

		this.healthTid
		this.checkHealth = options.checkInterval > 0
		if (this.checkHealth) {
			options.path = options.path || '/ping'
			options.method = options.method || 'GET'
			setTimeout(function () {
				self.startHealthChecks(options)
			}, Math.random() * 100)

		}
	}
	inherits(Endpoint, EventEmitter)

	Endpoint.prototype.resetCounters = function () {
		this.requestsLastCheck = this.requestRate - this.pending
		this.requestCount = this.pending
		this.successes = 0
		this.failures = 0
	}

	Endpoint.prototype.setPending = function () {
		this.pending = this.requestCount - (this.successes + this.failures)
		if (this.requestCount === MAX_COUNT) {
			this.resetCounters()
		}
	}

	Endpoint.prototype.complete = function (error, request, response, body) {
		this.deleteRequest(request.id)
		this.setPending()
		request.callback(error, response, body)
		request.callback = null
	}

	Endpoint.prototype.succeeded = function (request, response, body) {
		this.successes++
		this.complete(null, request, response, body)
	}

	Endpoint.prototype.failed = function (error, request) {
		this.failures++
		this.complete(error, request)
	}

	Endpoint.prototype.busyness = function () {
		return this.pending
	}

	// options: {
	//   agent:
	//   path:
	//   method:
	//   retryFilter:
	//   encoding: body encoding (utf8)
	// }
	// data:
	// callback: function (error, response, body) {}
	Endpoint.prototype.request = function (options, data, callback) {
		if (this.pending >= this.maxPending) {
			return callback({
				reason: 'full',
				message: 'too many pending requests ' + this.pending + '/' + this.maxPending
			})
		}
		options.host = this.ip
		options.port = this.port
		options.retryFilter = options.retryFilter || noop
		if (options.agent !== false) {
			options.agent = this.agent
		}
		if (options.encoding !== null) {
			options.encoding = options.encoding || 'utf8'
		}
		var req = this.http.request(options)
		req.node = this
		req.options = options
		req.id = this.requestCount++
		req.lastTouched = clock
		req.callback = callback || noop
		req.on('response', gotResponse)
		req.on('error', gotError)
		req.end(data)

		this.setPending()
		this.requests[req.id] = req
	}

	Endpoint.prototype.setHealthy = function (newState) {
		if (this.checkHealth && this.healthy !== newState) {
			this.healthy = newState
			this.emit('health', this)
		}
	}

	Endpoint.prototype.deleteRequest = function (id) {
		delete this.requests[id]
	}

	function gotPingResponse(error, response, body) {
		this.node.setHealthy(!error && response.statusCode === 200)
	}

	Endpoint.prototype.ping = function (options) {
		this.request(options, null, gotPingResponse)
	}

	Endpoint.prototype.startHealthChecks = function (options) {
		this.stopHealthChecks()
		this.ping(options)
		this.healthTid = setTimeout(this.startHealthChecks.bind(this, options), options.checkInterval)
	}

	Endpoint.prototype.stopHealthChecks = function () {
		clearTimeout(this.healthTid)
	}

	// this = request
	function gotResponse(response) {
		response.bodyChunks = []
		response.request = this
		response.on('data', gotData)
		response.on('end', gotEnd)
		response.on('aborted', gotAborted)
	}

	// this = request
	function gotError(error) {
		this.node.failed({
			reason: error.message,
			message: this.node.ip + ':' + this.node.port + ' error: ' + error.message
		},
		this)
		this.node.setHealthy(false)
	}

	// this = response
	function gotData(chunk) {
		this.request.lastTouched = clock
		this.bodyChunks.push(chunk)
	}

	// this = response
	function gotEnd() {
		var req = this.request
		var opt = req.options
		var node = req.node

		if (req.callback === null) { return }
		node.setHealthy(true)

		var buffer = new Buffer(this.bodyChunks.length)
		var offset = 0
		for (var i = 0; i < this.bodyChunks.length; i++) {
			var chunk = this.bodyChunks[i]
			chunk.copy(buffer, offset, 0, chunk.length)
			offset += chunk.length
		}

		var body = (opt.encoding !== null) ? buffer.toString(opt.encoding) : buffer

		var delay = opt.retryFilter(opt, this, body)
		if (delay !== false) { // delay may be 0
			return node.failed({
				delay: delay,
				reason: 'filter',
				message: node.ip + ':' + node.port + ' error: rejected by filter'
			},
			req)
		}
		node.succeeded(req, this, body)
	}

	// this = response
	function gotAborted() {
		this.request.node.failed({
				reason: 'aborted',
				message: this.request.node.ip + ':' + this.request.node.port + ' error: connection aborted'
			},
			this.request)
	}

	return Endpoint
}
