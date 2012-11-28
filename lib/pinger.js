module.exports = function (inherits, EventEmitter) {

	function Pinger(request) {
		this.onPingResponse = pingResponse.bind(this)
		this.request = request.bind(this, this.onPingResponse)
		this.running = false
		this.attempts = 0
		EventEmitter.call(this)
	}
	inherits(Pinger, EventEmitter)

	function pingResponse(error, response, body) {
		if (!error && response.statusCode === 200) {
			this.emit('pong')
			this.running = false
		}
		else {
			this.attempts++
			this.ping()
		}
	}

	function exponentialBackoff(attempt) {
		return Math.min(
			Math.floor(Math.random() * Math.pow(2, attempt) + 10),
			10000)
	}

	Pinger.prototype.ping = function () {
		if (this.attempts) {
			setTimeout(this.request, exponentialBackoff(this.attempts))
		}
		else {
			this.request()
		}
	}

	Pinger.prototype.start = function () {
		if (!this.running) {
			this.running = true
			this.attempts = 0
			this.ping()
		}
	}

	return Pinger
}
