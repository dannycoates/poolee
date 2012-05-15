// An object to track server requests and handle retries
//
// pool: a pool of endpoints
// options: {
//  attempts: number of tries
//  maxHangups: number of 'socket hang ups' before giving up (2)
//  maxAborts: number of 'aborted' before giving up (2)
//  retryDelay: minimum ms to wait before first retry using exponential backoff (20)
// }
// callback: function (err, response, body) {}
function RequestSet(pool, options, callback) {
	this.options = options || {}
	this.pool = pool
	this.callback = callback

	this.attemptsLeft = options.attempts || Math.min(5, Math.max(pool.nodes.length, 2))
	this.attempts = this.attemptsLeft

	this.maxHangups = options.maxHangups || 2
	this.hangups = 0

	this.maxAborts = options.maxAborts || 2
	this.aborts = 0

	if (!options.retryDelay && options.retryDelay !== 0) {
		options.retryDelay = 20
	}
	this.delay = options.retryDelay
}

function exponentialBackoff(attempt, delay) {
	return Math.random() * Math.pow(2, attempt) * delay
}

// this = RequestSet
function handleResponse(err, response, body) {
	this.attemptsLeft--
	if (err) {
		var delay = (err.delay === true)
			? exponentialBackoff(this.attempts - this.attemptsLeft, this.delay)
			: err.delay

		if (err.reason === "socket hang up") {
			this.hangups++
		}
		else if (err.reason === "aborted") {
			this.aborts++
		}

		if (this.attemptsLeft > 0 && this.hangups < 2 && this.aborts < 2) {
			if (delay > 0) {
				setTimeout(this.doRequest.bind(this), delay)
			} else {
				this.doRequest()
			}
		}
		else if (this.callback) {
			this.callback(err)
			this.callback = null
		}
	}
	else if (this.callback) {
		this.callback(null, response, body)
		this.callback = null
	}
}

// An http(s) request that might be retried
//
// pool: a pool of endpoints
// options: {
//  attempts: number of tries
//  maxHangups: number of 'socket hang ups' before giving up (2)
//  maxAborts: number of 'aborted' before giving up (2)
//  retryDelay: minimum ms to wait before first retry using exponential backoff (20)
// }
// callback: function (err, response, body) {}
RequestSet.request = function (pool, options, callback) {
	var set = new RequestSet(pool, options, callback)
	set.doRequest()
}

RequestSet.prototype.doRequest = function () {
	var node = this.pool.get_node()
	if (node === undefined) {
		this.callback({ message: 'no nodes' })
	}
	else {
		node.request(this.options, handleResponse.bind(this))
	}
}

module.exports = RequestSet

