//#!/usr/bin/env node

var http = require('http');
var url = require('url');
var qs = require('querystring');
var emoji  = require('node-emoji');
var clc    = require('cli-color');

var emojis = emoji.emoji;

var static = require('./exclaim-static');

const EXCLAIM_VERSION = require('./package.json').version;

const DEFAULT_PORT = 8010;
const DEBUG = parseInt(process.env.EXCLAIM_DEBUG) > 0 ? true : false;
const SUPPORTED_STYLE_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const SUPPORTED_STYLE_TYPES  = ['bold', 'italic', 'underline', 'blink', 'inverse', 'strike'];

function Exclaim(host, port, cb) {
	
	var self = this;
	this.server = http.createServer(
		(req, res) => {
			self.handleRequest(req, res);
		}
	);
	
	if (! host) host = '127.0.0.1';
	if (! port) port = DEFAULT_PORT;
	
	this.server.listen(port, host, function() {
		console.log('%s  Ready on http://%s:%s', emojis.white_check_mark, host, port);
		if (cb) cb();
	});
	
	this.msgId = 1000; 
	this.msg_buffer = [];
	this.counts = {
		'total': 0,
		'filtered': 0,
		'presented': 0
	};
	
	this.active_filter = [null, null];
	this.use_buffer = false;	
}

Exclaim.prototype.handleRequest = function(request, response) {
	//var req = url.parse(request.url, true);
	if (DEBUG) console.log(request.method + ' -> ' + request.url);
	
	post_body = '';
	
	if (request.url == '/exclaim.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end( static.postJS() );
		return;
	}
	
	var self = this;
	
	if (request.method == 'POST') {
		request.on('data', (chunk) => {
			post_body += chunk.toString();
		});
		
		request.on('end', () => {
			post_body = qs.parse(post_body);
			if (Object.keys(post_body).length == 0) post_body = url.parse(request.url, true).query;
			if (DEBUG) console.log('POST BODY:\n', post_body);
			response.end(
				JSON.stringify( self.parseRequest( url.parse(request.url).pathname, post_body) )
			);
		});
//	} else {
//		response.end('{"success":false}');
	}
	
	//console.log("request=>\n", request);
}

Exclaim.prototype.parseRequest = function(url, body) {
	if (url != '/log') {
		if (DEBUG) console.log("??? Non /log POST", url);
		return { success: false };
	}
	
	var ctx = null;
	if (body['ctx']) ctx = body['ctx'].toString().toLowerCase();

	var raw_msg = body['msg'];
	
	var msg = this.processMessage(raw_msg, ctx);
	if (DEBUG) console.log( '> IN MSG:', `[${ctx}]`, raw_msg );
	
	if (! this.filterMessage(msg)) {
		if (this.use_buffer) this.bufferMessage(msg); 
		else this.logMessage(msg);
	} else {
		if (DEBUG) console.log("{ message filtered }", this.active_filter);
	}
	
	return { success: true, msgId: ++this.msgId, context: ctx, msgLen: msg.msg.length };
}

Exclaim.prototype.filterMessage = function(msg) {
	// to do: use any filters we have and return `true` if we want to ignore it.
	if (this.active_filter[0] == null && this.active_filter[1] == null) return false;
	
	var filtered = false;
	
	//if (DEBUG) console.log("? FILTER MSG CTX OF " + msg.ctx + " AGAINST " + active_filter.join(":"));
	
	if ( (! msg.ctx) || msg.ctx == '-') {
		// we have a filter on, no dice.
		filtered = true;
	} else {
		var ctx = msg.ctx.split(":");
		if (this.active_filter[0] == null || this.active_filter[0] == '*' || ctx[0] == this.active_filter[0]) {
			// so far so good
		} else {
			filtered = true;
		}
		
		if ( (!filtered) && (this.active_filter[1] == null || this.active_filter[1] == '*' || ctx[1] == this.active_filter[1])) {
			// I think we're okay
		} else {
			filtered = true;
		}
	}
	
	if (filtered) this.counts.filtered += 1;
	
	return filtered;
}

Exclaim.prototype.processMessage = function(_msg, ctx) {
	var styled_msg = styleMessage(_msg);
	var parsed_msg = emoji.emojify(styled_msg);
	
	this.counts.total += 1;
	
	return { 'msg': parsed_msg, 'ctx': ctx };
}

Exclaim.prototype.bufferMessage = function(msg) {
	this.msg_buffer.push(msg);
}

Exclaim.prototype.flushBuffer = function() {
	// protect against sudden re-engagement
	var siz = this.msg_buffer.length;
	
	for (var i = 0; i < siz; i++) {
		this.logMessage(this.msg_buffer.shift());
	}
	
	if ( (! this.use_buffer) && this.msg_buffer.length > 0) {
		// recurse if something showed up and its 
		// okay to display.
		this.flushBuffer();
	}
}

Exclaim.prototype.logMessage = function(msg) {
	var _msg = msg.ctx != null ? clc.bold(`[${msg.ctx}]`) + ` ${msg.msg}` : `${msg.msg}`;
	console.log(_msg);
	this.counts.presented += 1;
}

// alias some functionality to make testing easier.
Exclaim.prototype.sendCLI = function(cmd) {
	return processCLI(this, cmd);
};

Exclaim.prototype.stats = function() {
	return {
		'total': this.counts.total,
		'filtered': this.counts.filtered,
		'presented': this.counts.presented,
		'buffer': this.use_buffer ? 1 : 0,
		'buffered': this.msg_buffer.length
	};
};

Exclaim.prototype.setFilterTo = function(a, b) {
	this.active_filter[0] = a ? a : null;
	this.active_filter[1] = b ? b : null;
};

Exclaim.prototype.useBuffer = function(bool) {
	if (bool) {
		this.use_buffer = true;
	} else {
		this.use_buffer = false;
		if (this.msg_buffer.length > 0) {
			this.flushBuffer();
		}
	}
};


function processCLI(ex, cmd) {
	if (DEBUG) console.log( emoji.emojify(`:watermelon:  RAW ${cmd}`) );

	cmd = cmd.replace(/\n$/, '');
	
	if (cmd.length == 0) return true;
	
	if (cmd.match(/^[a-zA-Z0-9\-\_\*]+:[a-zA-Z0-9\-\_\*]+$/)) {
		// set filter
		var filter = cmd.split(":");
		ex.setFilterTo(filter[0] == '*' ? null : filter[0],
					   filter[1] == '*' ? null : filter[1]
		);
		
		console.log(emoji.emojify(`:flashlight:  Filter SET to '${filter}'.`));
		return true;
	} else if (cmd == 'x' || cmd == '*' || cmd == '-' || cmd == 'all') {
		// set filter off
		ex.setFilterTo(null, null);
		
		console.log(emoji.emojify(`:flashlight:  Filter disabled.`));
		return true;
	} else {
		return false;
	}
	
	return false;
}


function styleMessage(_msg) {
	var ma;
	while(ma = _msg.match(/\{\{([a-z\:]+)\} (.*?)\}\}/)) {
		var style = ma[1];
		var text  = ma[2];
		_msg = _msg.replace('{{' + style + '} ' + ma[2] + '}}', styleText(style, text));
	}
	
	return _msg;
}

function styleText(_style, text) {
	var f = null;
	var styles = _style.split(":");
	for (var si in styles) {
		var style = styles[si];
		if (SUPPORTED_STYLE_COLORS.indexOf(style) != -1) {
			var m = ''+style+'Bright';
			f = f ? f[m] : clc[m];
		} else if (SUPPORTED_STYLE_TYPES.indexOf(style) != -1) {
			f = f ? f[style] : clc[style];
		} else {
			// ignore.
			return;
		}
	}
	
	return f ? f(text) : text;
}

function activateCLI(ex) {
	process.stdin.setEncoding('utf-8');
	
	process.stdin.on('readable', () => {
		var chunk = process.stdin.read();
		if (chunk !== null) {
			if (! processCLI(ex, chunk)) {
				console.log(emoji.emojify(clc.red.bold(":warning:  Unknown command: ") + chunk));
			}
		}
	});
}

function timestamp() {
	var now = new Date();
	return [
		now.toLocaleDateString(),
		now.toLocaleTimeString()
	].join(" ");
}

function epoch() {
	return Math.floor(Date.now() / 1000);
}

function displayBanner() {
	console.log('');
	console.log(emoji.get('flashlight') + '  ' + clc.cyanBright.bold( "[ Exclaim! " + EXCLAIM_VERSION) + " ] A handy remote log tool!");
	console.log(emoji.get('flashlight') + "  by: Corey Sharrah <corey@eviltreehouse.com>");
	console.log(emoji.get('flashlight') + "  http://eviltreehouse.com/");
	console.log('');
}

// Either fire immediately or wait to be invoked.
if (require.main === module) {
	displayBanner();
	activateCLI(new Exclaim());
} else {
	module.exports = Exclaim;
}