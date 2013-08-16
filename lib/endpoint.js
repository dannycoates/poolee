var Stream = require('stream')
var http = require('http')
var KeepAlive = require('keep-alive-agent')

module.exports = function (inherits, EventEmitter, Pinger, EndpointError) {
	var MAX_COUNT = Math.pow(2, 52)
	var clock = Date.now()
	var clockInterval = null
	function noop() { return false }

	//
	// http: either require('http') or require('https')
	// ip: host ip
	// port: host port
	// options: {
	//   ping: ping path (no ping checks)
	//   pingTimeout: in ms (2000)
	//   maxSockets: max concurrent open sockets (20)
	//   timeout: default request timeout in ms (60000)
	//   resolution: how often timeouts are checked in ms (1000)
	//   keepAlive: use an alternate Agent that does keep-alive properly (boolean) default false
	//   agentOptions: {} an object for passing options directly to the Http Agent
	// }
	function Endpoint(protocol, ip, port, options) {
		options = options || {}

		this.http = protocol
		this.ip = ip
		this.port = port
		this.healthy = true
		this.name = this.ip + ':' + this.port
		this.address = this.ip
		this.keepAlive = options.keepAlive

		this.pinger = new Pinger(this.ping.bind(this))
		this.pinger.on('pong', function () {
			this.setHealthy(true)
		}.bind(this))

		this.pingPath = options.ping
		this.pingTimeout = options.pingTimeout || 2000
		if (this.keepAlive) {
			if (protocol === http) {
				this.agent = new KeepAlive(options.agentOptions)
			}
			else {
				this.agent = new KeepAlive.Secure(options.agentOptions)
			}
		}
		else {
			this.agent = new protocol.Agent(options.agentOptions)
		}
		this.agent.maxSockets = options.maxSockets || 20

		this.requests = {}
		this.requestCount = 0
		this.requestsLastCheck = 0
		this.requestRate = 0
		this.pending = 0
		this.successes = 0
		this.failures = 0
		this.filtered = 0

		this.timeout = (options.timeout === 0) ? 0 : options.timeout || (60 * 1000)
		this.resolution = (options.resolution === 0) ? 0 : options.resolution || 1000
		if (this.resolution > 0 && this.timeout > 0) {
			this.timeoutInterval = setInterval(this.checkTimeouts.bind(this), this.resolution)
		}

		if (!clockInterval) {
			clockInterval = setInterval(function () { clock = Date.now() }, 10)
		}
	}
	inherits(Endpoint, EventEmitter)

	Endpoint.prototype.connected = function () {
		return this.agent.sockets[this.name] && this.agent.sockets[this.name].length
	}

	Endpoint.prototype.ready = function () {
		return this.healthy
			&& (this.keepAlive ?
				this.connected() > this.pending :
				this.pending === 0
			)
	}

	Endpoint.prototype.stats = function () {
		var socketNames = Object.keys(this.agent.sockets)
		var requestCounts = []
		for (var i = 0; i < socketNames.length; i++) {
			var name = socketNames[i]
			var s = this.agent.sockets[name] || []
			for (var j = 0; j < s.length; j++) {
				requestCounts.push(s[j]._requestCount || 1)
			}
		}
		return {
			name: this.name,
			requestCount: this.requestCount,
			requestRate: this.requestRate,
			pending: this.pending,
			successes: this.successes,
			failures: this.failures,
			filtered: this.filtered,
			healthy: this.healthy,
			socketRequestCounts: requestCounts
		}
	}

	Endpoint.prototype.checkTimeouts = function () {
		var keys = Object.keys(this.requests)
		for (var i = 0; i < keys.length; i++) {
			var r = this.requests[keys[i]]
			var expireTime = clock - r.options.timeout
			if (r.lastTouched <= expireTime) {
				if (r.options.path !== this.pingPath) {
					this.emit("timeout", r)
				}
				r.timedOut = true
				r.abort()
			}
		}
		this.requestRate = this.requestCount - this.requestsLastCheck
		this.requestsLastCheck = this.requestCount
	}

	Endpoint.prototype.resetCounters = function () {
		this.requestsLastCheck = this.requestRate - this.pending
		this.requestCount = this.pending
		this.successes = 0
		this.failures = 0
		this.filtered = 0
	}

	Endpoint.prototype.setPending = function () {
		this.pending = this.requestCount - (this.successes + this.failures + this.filtered)
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
		this.setHealthy(false)
		this.complete(error, request)
	}

	Endpoint.prototype.filterRejected = function (error, request) {
		this.filtered++
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
	//   timeout: request timeout in ms (this.timeout)
	//   encoding: response body encoding (utf8)
	//   data: string, buffer, or stream
	//   stream: stream instead of buffer response body (default based on callback)
	// }
	// callback: function (error, response, body) {}
	// callback: function (error, response) {}
	Endpoint.prototype.request = function (options, callback) {
		options.host = this.ip
		options.port = this.port
		options.retryFilter = options.retryFilter || noop
		options.timeout = options.timeout || this.timeout
		options.headers = options.headers || {}
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
		req.callback = callback || noop
		req.stream = (options.stream === undefined) ? req.callback.length === 2 : options.stream
		req.lastTouched = clock
		req.on('response', gotResponse)
		req.on('error', gotError)

		var data = options.data
		if (data instanceof Stream) {
			data.pipe(req)
		}
		else {
			if (data) {
				req.setHeader("Content-Length"
					, Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data)
				)
			}
			req.end(data)
		}

		this.setPending()
		this.requests[req.id] = req
	}

	Endpoint.prototype.setHealthy = function (newState) {
		if (!this.pingPath) {
			return // an endpoint with no pingPath can never be made unhealthy
		}
		if (!newState) {
			this.pinger.start()
		}
		if (this.healthy !== newState) {
			this.healthy = newState
			this.emit('health', this)
		}
	}

	Endpoint.prototype.deleteRequest = function (id) {
		delete this.requests[id]
	}

	Endpoint.prototype.ping = function (cb) {
		return this.request(
			{ path: this.pingPath
			, method: 'GET'
			, timeout: this.pingTimeout
			}
			, cb
		)
	}

	// this = request
	function gotResponse(response) {
		if (this.stream) {
			return this.node.succeeded(this, response)
		}
		response.bodyChunks = []
		response.bodyLength = 0
		response.request = this
		response.on('data', gotData)
		response.on('end', gotEnd)
		response.on('aborted', gotAborted)
	}

	// this = request
	function gotError(error) {
		var msg = this.node.ip + ':' + this.node.port + ' error: '
		msg += this.timedOut ? 'request timed out' : error.message
		this.node.failed(new EndpointError(msg,
			{ reason: error.message
			, attempt: this
			})
			, this)
	}

	// this = response
	function gotData(chunk) {
		this.request.lastTouched = clock
		this.bodyChunks.push(chunk)
		this.bodyLength += chunk.length
	}

	// this = response
	function gotEnd() {
		var req = this.request
		var opt = req.options
		var node = req.node

		if (req.callback === null) { return }

		if (req.timedOut) { return gotAborted.call(this) }

		var buffer = new Buffer(this.bodyLength)
		var offset = 0
		for (var i = 0; i < this.bodyChunks.length; i++) {
			var chunk = this.bodyChunks[i]
			chunk.copy(buffer, offset, 0, chunk.length)
			offset += chunk.length
		}

		var body = (opt.encoding !== null) ? buffer.toString(opt.encoding) : buffer

		var delay = opt.retryFilter(opt, this, body)
		if (delay !== false) { // delay may be 0
			return node.filterRejected(new EndpointError(node.ip + ':' + node.port + ' error: rejected by filter',
			{ delay: delay
			, reason: 'filter'
			, attempt: req
			})
			, req)
		}
		node.succeeded(req, this, body)
	}

	// this = response
	function gotAborted() {
		var msg = this.request.node.ip + ':' + this.request.node.port + ' error: '
		msg += this.request.timedOut ? 'response timed out' : 'connection aborted'
		this.request.node.failed(new EndpointError(msg,
			{ reason: 'aborted'
			, attempt: this.request
			})
			, this.request)
	}

	var overloaded = null

	Endpoint.overloaded = function () {
		if (!overloaded) {
			overloaded = new Endpoint({Agent: Object}, null, null, {timeout: 0})
			overloaded.healthy = false
			overloaded.request = function (options, callback) {
				return callback(new EndpointError('too many pending requests',
					{ reason: 'full'
					, delay: true
					, attempt: { options: options }
					})
				)
			}
		}
		return overloaded
	}

	var unhealthy = null

	Endpoint.unhealthy = function () {
		if (!unhealthy) {
			unhealthy = new Endpoint({Agent: Object}, null, null, {timeout: 0})
			unhealthy.healthy = false
			unhealthy.request = function (options, callback) {
				return callback(new EndpointError('no nodes',
					{ reason: 'unhealthy'
					, delay: true
					, attempt: { options: options }
					})
				)
			}
		}
		return unhealthy
	}

	return Endpoint
}
