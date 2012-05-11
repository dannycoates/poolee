module.exports = function (inherits, EventEmitter) {
	var clock = Date.now()
	setInterval(function () { clock = Date.now() }, 10)
	function noop() {}

	//
	// http: either require('http') or require('https')
	// ip: host ip
	// port: host port
	// options: {
	//   path: ping path (/ping)
	//   method: ping method (GET)
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

	Endpoint.prototype.busyness = function () {
		return (
			(this.agent.sockets[this.name] || []).length +
			((this.agent.requests[this.name] || []).length * 2)
		)
	}

	// options: {
	//   agent:
	//   path:
	//   method:
	//   retryFilter:
	// }
	// data:
	// callback: function (err, result) {}
	Endpoint.prototype.request = function (options, data, callback) {
		options.host = this.ip
		options.port = this.port
		if (options.agent !== false) {
			options.agent = this.agent
		}
		var req = this.http.request(options)
		req.node = this
		req.options = options
		req.on('response', gotResponse)
		req.on('error', gotError)
		req.end(data)
		req.id = this.requestCount++
		req.lastTouched = clock

		this.requests[req.id] = req
		this.callback = callback
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

	function gotPingResponse(err, response, body) {
		this.setHealthy(!err && response.statusCode === 200)
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
		response.body = ''
		response.request = this
		response.on('data', gotData)
		response.on('end', gotEnd)
		response.on('aborted', gotAborted)
	}

	// this = request
	function gotError(err) {
		this.node.deleteRequest(this.id)
		this.node.setHealthy(false)
		this.node.callback({ //fail
			reason: err.message,
			message: this.node.ip + ':' + this.node.port + ' error: ' + err.message
		})
		this.node.callback = noop
	}

	// this = response
	function gotData(chunk) {
		this.request.lastTouched = clock
		this.body += chunk
	}

	// this = response
	function gotEnd() {
		var req = this.request
		var opt = req.options
		var node = req.node

		node.setHealthy(true)
		node.deleteRequest(req.id)

		if (typeof opt.retryFilter === 'function') {
			var delay = opt.retryFilter(opt, this, this.body)
			if (delay !== false) {
				return node.callback({ //fail
					delay: delay,
					reason: 'filter',
					message: node.ip + ':' + node.port + ' error: rejected by filter'
				})
			}
		}
		node.callback(null, this, this.body) //success
	}

	// this = response
	function gotAborted() {
		this.request.node.deleteRequest(this.request.id)
		this.request.node.callback({ //fail
				reason: 'aborted',
				message: this.request.node.ip + ':' + this.request.node.port + ' error: connection aborted'
			})
		this.request.node.callback = noop
	}

	return Endpoint
}
