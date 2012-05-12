module.exports = function (inherits, EventEmitter, Endpoint, RequestSet) {

	//////////////////////////////////////
	//
	//  Pool
	//
	// nodes: array of strings formatted like 'ip:port'
	//
	// options:
	// {
	//    maxPending: number of pending requests allowed per endpoint (500)
	//    checkInterval: number (milliseconds) health check poll interval, default null (no check)
	//    path: string querystring for the health check (default = '/ping')
	//    method: string heath check http method (default = 'GET')
	//    retryFilter: function (response) { return true to reject response and retry }
	//    retryDelay: number (milliseconds) default 20
	//    name: string (optional)
	// }
	function Pool(http, nodes, options) {
		options = options || {}
		if (!http || !http.request) {
			throw new Error('invalid http module')
		}

		options.checkInterval = options.checkInterval || options.check_interval
		options.retryFilter = options.retryFilter || options.retry_filter
		options.retryDelay = options.retryDelay || options.retry_delay

		if (!options.retryDelay && options.retryDelay !== 0) {
			options.retryDelay = 20
		}

		this.name = options.name
		this.options = options
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

	// options:
	// {
	//   path: string
	//   method: ['POST', 'GET', 'PUT', 'DELETE', 'HEAD']
	//   retryFilter: function (response) { return true to reject response and retry }
	//   attempts: number (optional, default = nodes.length)
	//   retryDelay: number (milliseconds) default Pool.retry_delay
	// }
	//
	// data: string
	//
	// callback:
	// function(err, res, body) {}
	Pool.prototype.request = function (options, data, callback) {
		var self = this
		options = options || {}

		options.retryDelay = options.retryDelay || options.retry_delay
		if (!options.retryDelay && options.retryDelay !== 0) {
			options.retryDelay = this.options.retryDelay
		}

		options.retryFilter = options.retryFilter || options.retry_filter
		if (!options.retryFilter) {
			options.retryFilter = this.options.retryFilter
		}

		var started = Date.now()
		RequestSet.request(this, options, data, function (err, res, body) {
			options.success = !err
			self.emit('timing', Date.now() - started, options)
			callback(err, res, body)
		})
	}

	Pool.prototype.get = function (options, callback) {
		options.method = 'GET'
		this.request(options, null, callback)
	}

	Pool.prototype.put = function (options, data, callback) {
		options.method = 'PUT'
		return this.request(options, data, callback)
	}

	Pool.prototype.post = function (options, data, callback) {
		options.method = 'POST'
		return this.request(options, data, callback)
	}

	Pool.prototype.del = function (options, callback) {
		options.method = 'DELETE'
		options.agent = false // XXX
		options.headers['Content-Length'] = 0
		return this.request(options, null, callback)
	}

	Pool.prototype.get_stats = function () {
		var stats = {
			percent_healthy: 0,
			max_busyness: 0,
			min_busyness: Number.MAX_VALUE,
			avg_busyness: 0,
		}
		var h = 0
		var sum = 0
		var len = this.nodes.length
		for (var i = 0; i < len; i++) {
			var node = this.nodes[i]
			if (node.healthy) {
				h++
				var b = node.busyness()
				if (b > stats.max_busyness) {
					stats.max_busyness = b
				}
				if (b < stats.min_busyness) {
					stats.min_busyness = b
				}
				sum += b
			}
		}
		stats.percent_healthy = h / len
		stats.avg_busyness = sum / h
		return stats
	}

	Pool.prototype.get_node = function () {
		var len = this.nodes.length
		if (len === 1) {
			return this.nodes[0]
		}
		var h = 0
		var sum = 0
		for (var i = 0; i < len; i++) {
			var node = this.nodes[i]
			if (node.healthy) {
				h++
				sum += node.busyness()
			}
		}
		if (h !== 0) {
			var avg = sum / h
			var r = Math.floor(Math.random() * len)
			for (i = 0; i < len; i++) {
				r = (r + 1) % len
				node = this.nodes[r]
				if (node.healthy && avg >= node.busyness()) {
					return node
				}
			}
		}
	}

	return Pool
}
