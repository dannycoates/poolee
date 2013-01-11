module.exports = function (inherits, EventEmitter, Endpoint, RequestSet) {

	//////////////////////////////////////
	//
	//  Pool
	//
	// nodes: array of strings formatted like 'ip:port'
	//
	// options:
	// {
	//    maxPending: number of pending requests allowed (1000)
	//    ping: ping path (default = no ping checks)
	//    pingTimeout: number (milliseconds) default 2000
	//    retryFilter: function (response) { return true to reject response and retry }
	//    retryDelay: number (milliseconds) default 20
	//    keepAlive: use an alternate Agent that does keep-alive properly (boolean) default false
	//    name: string (optional)
	//    maxRetries: number (default = 5)
	//    agentOptions: {} an object for passing options directly to the Http Agent
	// }
	function Pool(http, nodes, options) {
		options = options || {}
		if (!http || !http.request || !http.Agent) {
			throw new Error('invalid http module')
		}

		options.retryFilter = options.retryFilter || options.retry_filter
		options.retryDelay = options.retryDelay || options.retry_delay
		options.ping = options.ping || options.path
		options.maxRetries = options.maxRetries === 0 ? 0 : options.maxRetries || 5

		if (!options.retryDelay && options.retryDelay !== 0) {
			options.retryDelay = 20
		}

		this.name = options.name
		this.options = options
		this.maxPending = options.maxPending || 1000
		this.nodes = []
		if (Array.isArray(nodes)) {
			for (var i = 0; i < nodes.length; i++) {
				var ip_port = nodes[i].split(':')
				var ip = ip_port[0]
				var port = +ip_port[1]
				if (port > 0 && port < 65536) {
					var node = new Endpoint(http, ip, port, options)
					node.on('health', node_health_changed.bind(this))
					node.on('timeout', node_timed_out.bind(this))
					this.nodes.push(node)
				}
			}
		}

		if (this.nodes.length === 0) {
			throw new Error('no valid nodes')
		}
		this.length = this.nodes.length
	}
	inherits(Pool, EventEmitter)

	// Bound handlers

	function node_health_changed(node) {
		this.emit('health', node.ip + ':' + node.port + ' health: ' + node.healthy)
	}

	function node_timed_out(request) {
		this.emit('timeout', request.node.ip + ':' + request.node.port + request.options.path)
	}

	// returns an array of healthy Endpoints
	Pool.prototype.healthy_nodes = function () {
		var healthy = [], len = this.nodes.length
		for (var i = 0; i < len; i++) {
			var n = this.nodes[i]
			if (n.healthy) {
				healthy.push(n)
			}
		}
		return healthy
	}
	Pool.prototype.healthyNodes = Pool.prototype.healthy_nodes

	Pool.prototype.onRetry = function (err) {
		this.emit('retrying', err)
	}

	function optionsFu(options) {
		return (typeof options === 'string') ? { path: options } : (options || {})
	}

	// options:
	// {
	//   path: string
	//   method: ['POST', 'GET', 'PUT', 'DELETE', 'HEAD'] (GET)
	//   retryFilter: function (response) { return true to reject response and retry }
	//   attempts: number (optional, default = nodes.length)
	//   retryDelay: number (milliseconds) default Pool.retry_delay
	//   timeout: request timeout in ms
	//   encoding: response body encoding (utf8)
	//   stream: stream instead of buffer response body (default based on callback)
	// }
	//
	// data: string, buffer, or stream (optional)
	//
	// callback:
	// function(err, res, body) {}
	// function(err, res) {}
	Pool.prototype.request = function (options, data, callback) {
		var self = this
		options = optionsFu(options)

		if (!options.data && (typeof data === 'string' || Buffer.isBuffer(data))) {
			options.data = data
		}
		else if (typeof data === 'function') {
			callback = data
		}

		options.method = options.method || 'GET'

		options.retryDelay = options.retryDelay || options.retry_delay
		if (!options.retryDelay && options.retryDelay !== 0) {
			options.retryDelay = this.options.retryDelay
		}

		options.retryFilter = options.retryFilter || options.retry_filter
		if (!options.retryFilter) {
			options.retryFilter = this.options.retryFilter
		}
		options.stream = (options.stream === undefined) ? callback.length === 2 : options.stream

		var started = Date.now()
		RequestSet.request(this, options, function (err, res, body) {
			options.success = !err
			options.reused = res && res.socket && (res.socket._requestCount || 1) > 1
			self.emit('timing', Date.now() - started, options)
			callback(err, res, body)
		})
	}

	Pool.prototype.get = Pool.prototype.request

	Pool.prototype.put = function (options, data, callback) {
		options = optionsFu(options)
		options.method = 'PUT'
		return this.request(options, data, callback)
	}

	Pool.prototype.post = function (options, data, callback) {
		options = optionsFu(options)
		options.method = 'POST'
		return this.request(options, data, callback)
	}

	Pool.prototype.del = function (options, callback) {
		options = optionsFu(options)
		options.method = 'DELETE'
		options.agent = false // XXX
		return this.request(options, callback)
	}

	Pool.prototype.stats = function () {
		var stats = []
		var len = this.nodes.length
		for (var i = 0; i < len; i++) {
			var node = this.nodes[i]
			stats.push(node.stats())
		}
		return stats
	}

	Pool.prototype.get_node = function () {
		var len = this.nodes.length
		var h = []
		var sum = 0
		var totalPending = 0
		var r = Math.floor(Math.random() * len)
		for (var i = 0; i < len; i++) {
			r = (r + 1) % len
			var node = this.nodes[r]
			if (node.ready()) {
				return node //fast path
			}
			else if (node.healthy) {
				h.push(node)
				sum += node.pending
			}
			totalPending += node.pending
		}
		if (totalPending >= this.maxPending) {
			return Endpoint.overloaded()
		}
		var avg = sum / h.length
		while (h.length) {
			var node = h.pop()
			if (node.pending <= avg) {
				return node
			}
		}
		return Endpoint.unhealthy()
	}

	Pool.prototype.getNode = Pool.prototype.get_node //must keep the old _ api

	Pool.prototype.pending = function () {
		return this.nodes.reduce(function (a, b) { return a + b.pending }, 0)
	}

	Pool.prototype.rate = function () {
		return this.nodes.reduce(function (a, b) { return a + b.requestRate }, 0)
	}

	Pool.prototype.requestCount = function () {
		return this.nodes.reduce(function (a, b) { return a + b.requestCount }, 0)
	}

	return Pool
}
