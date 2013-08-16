module.exports = function (inherits) {
	function EndpointError(message, struct) {
		if (message !== undefined) {
			this.message = message
		}

		if (!struct) { return }

		if (typeof struct.reason === 'string') {
			this.reason = struct.reason
		}

		if (struct.delay === true || struct.delay === false) {
			this.delay = struct.delay
		}

		if (struct.attempt) {
			this.attempt = struct.attempt
		}
	}
	inherits(EndpointError, Error)

	EndpointError.prototype.name = 'EndpointError'
	EndpointError.prototype.reason = ''
	EndpointError.prototype.delay = false
	EndpointError.prototype.attempt = null

	return EndpointError
}
