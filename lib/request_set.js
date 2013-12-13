var Stream = require('stream')

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

	this.attemptsLeft = attemptsFu(options, pool)
	this.attempts = this.attemptsLeft

	this.maxHangups = options.maxHangups || pool.options.maxRetries;
	this.hangups = 0

	this.maxAborts = options.maxAborts || pool.options.maxRetries;
	this.aborts = 0

	if (!options.retryDelay && options.retryDelay !== 0) {
		options.retryDelay = 20
	}
	this.delay = options.retryDelay
}

function attemptsFu(options, pool) {
	if (options.data instanceof Stream) {
		return 1
	}
	return options.attempts || Math.min(pool.options.maxRetries + 1, Math.max(pool.length, 2))
}

function exponentialBackoff(attempt, delay) {
	return Math.random() * Math.pow(2, attempt) * delay
}

function handleResponseFromNode(node) {
    return function(err, response, body) {
        return handleResponse.bind(this)(err, response, body, node);
    }
}

// this = RequestSet
function handleResponse(err, response, body, respondingNode) {
	this.attemptsLeft--
    if (!this.reqInfo) { this.reqInfo = {} };
	if (err) {
        if (!this.reqInfo.failedNodes) {
            this.reqInfo.failedNodes = [];
        }
        this.reqInfo.failedNodes.push(respondingNode.name);
		var delay = (err.delay === true)
			? exponentialBackoff(this.attempts - this.attemptsLeft, this.delay)
			: err.delay

		if (err.reason === "socket hang up") { this.hangups++ }
		else if (err.reason === "aborted") { this.aborts++ }

		if (this.attemptsLeft > 0 && this.hangups < this.maxHangups && this.aborts < this.maxAborts) {
			this.pool.onRetry(err)
			if (delay > 0) {
				setTimeout(this.doRequest.bind(this), delay)
			} else {
				this.doRequest()
			}
			return
		}
	}
	if (this.callback) {
        this.reqInfo.numRetries = this.attempts - this.attemptsLeft;
        if (respondingNode) {
            this.reqInfo.respondingNode = respondingNode.name;
        }

		this.callback(err, response, body, this.reqInfo)
		this.callback = null
	}
}

// An http(s) request that might be retried
//
// pool: a pool of endpoints
// options: {
//  attempts: number of tries
//  timeout: request timeout in ms
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
	node.request(this.options, handleResponseFromNode(node).bind(this))
}

module.exports = RequestSet

