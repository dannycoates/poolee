function PhiDetector() {
	this.size = 100
	this.window = [] // TODO: ringbuffer
	this.then = Date.now()
	this.avg = 0
	// this.variance = 0
}

PhiDetector.prototype.touch = function () {
	var self = this
	var now = Date.now()
	var win = this.window

	var span = now - this.then
	this.then = now

	win.push(span)
	if (win.length > this.size) {
		win.shift()
	}

	var count = win.length
	var total = win.reduce(function (a, b) { return a + b }, 0)
	this.avg = total / count

	// var totalVariance = win.reduce(function (a, b) { return a + Math.pow(b - self.avg, 2) }, 0)
	// this.variance = totalVariance / count
}

PhiDetector.prototype.val = function () {
	var span = Date.now() - this.then
	if (this.window.length < 10) {
		return 0
	}
	return -1 * (Math.log(Math.pow(Math.E, -1 * span / this.avg)) / Math.LN10)
}

module.exports = PhiDetector
