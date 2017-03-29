//#!/usr/bin/env node

var http = require('http');
var url = require('url');
var qs = require('querystring');
var emoji  = require('node-emoji');
var clc    = require('cli-color');
var fs = require('fs');
var path = require('path');

var emojis = emoji.emoji;

var static = require('./exclaim-static');

const EXCLAIM_VERSION = require('./package.json').version;

const DEFAULT_PORT = 18101;
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
		present('%s  Ready on http://%s:%s', emojis.white_check_mark, host, port);
		if (cb) cb();
	});
	
	this.lastIdx = 1000;
	this.lastSid = null;
	this.sidColor = null;
	
	// permanent until flushed
	this.msg_archive = [];
	
	// temporary (halted display)
	this.msg_buffer = [];
	
	// keep track of sessions we've seen.
	this._sessions = {};
	
	this.counts = {
		'total': 0,
		'sessions': 0,
		'filtered': 0,
		'presented': 0,
		'annotated': 0
	};
	
	this.ctx_filter = [null, null];
	this.search_filter = null;
	this.search_prune = false;
	
	this.use_buffer = false;	
}

Exclaim.prototype.handleRequest = function(request, response) {
	//var req = url.parse(request.url, true);
	if (DEBUG) console.log(request.method + ' -> ' + request.url);
	
	post_body = '';

	// Write CORS Headers so it can be used globally
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	// ...
	
	if (url.parse(request.url).pathname == '/exclaim.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end( static.postJS(null, EXCLAIM_VERSION) );
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
			
			var resp_content = JSON.stringify( self.parseRequest( url.parse(request.url).pathname, post_body) );
			if (DEBUG) console.log('RESPONSE CONTENT -> ', resp_content);
			
			response.setHeader('Content-Type', 'application/json');
			response.end(resp_content);
		});
		
		return;
	}
	
	// catch all -> 404
	response.writeHead(404, { 'Content-Type': 'text/plain' });
	response.end('File Not Found');
	
	//console.log("request=>\n", request);
}

Exclaim.prototype.parseRequest = function(url, body) {
	if (url == '/stats') {
		// if we want some gory log stats...
		return this.stats();
		
	} else if (url != '/log') {
		if (DEBUG) console.log("??? Non /log POST", url);
		return { success: false };
	}
	
	var idx = 0;
	if (body['i']) idx = parseInt(body['i']);
	else idx = this.lastIdx + 1;
	
	var ctx = null;
	if (body['ctx']) ctx = body['ctx'].toString().toLowerCase();
	
	var sid = null;
	if (body['sid']) sid = body['sid'].toString().toLowerCase();

	var raw_msg = body['msg'];
	
	var msg = this.processMessage(idx, raw_msg, ctx, sid);
	if (DEBUG) console.log( '> #${idx} MSG:', `[${ctx}:${sid}]`, raw_msg );
	
	if (! this.filterMessage(msg)) {
		if (this.use_buffer) this.bufferMessage(msg); 
		else this.logMessage(msg);
	} else {
		if (DEBUG) console.log("{ message filtered }", this.ctx_filter);
	}
	
	return { success: true, msg: { idx: idx, ctx: ctx, sid: sid, len: msg.msg.length } };
}

Exclaim.prototype.filterMessage = function(msg) {
	if (this.ctx_filter[0] == null && this.ctx_filter[1] == null && this.search_prune == false) return false;
	
	var ctx_filtered = this.ctx_filter[0] == null && this.ctx_filter[1] == null ? false : true;
	
	var filtered = false;
	
	//if (DEBUG) console.log("? FILTER MSG CTX OF " + msg.ctx + " AGAINST " + ctx_filter.join(":"));
	
	if ( ctx_filtered && ((! msg.ctx) || msg.ctx == '-')) {
		// we have a filter on, no dice.
		filtered = true;
	} else if (ctx_filtered) {
		var ctx = msg.ctx.split(":");
		if (this.ctx_filter[0] == null || this.ctx_filter[0] == '*' || ctx[0] == this.ctx_filter[0]) {
			// so far so good
		} else {
			filtered = true;
		}
		
		if ( (!filtered) && (this.ctx_filter[1] == null || this.ctx_filter[1] == '*' || ctx[1] == this.ctx_filter[1])) {
			// I think we're okay
		} else {
			filtered = true;
		}
	}
	
	// check if search-prune should cause this message to filter out...
	if (this.search_prune == true && !filtered && this.search_filter != null) {
		if (msg.msg.indexOf(this.search_filter) == -1) {
			filtered = true;
		}
	} else {
//		console.log(`[Not filtered and search_prune mode disabled ${filtered} ${this.search_filter} ${this.search_prune}.]`);
	}
	
	if (filtered) this.counts.filtered += 1;
	
	return filtered;
};

Exclaim.prototype.processMessage = function(idx, msg, ctx, sid) {
	var styled_msg = styleMessage(msg);
	var parsed_msg = emoji.emojify(styled_msg);
	
	this.counts.total += 1;
	this.lastIdx = idx;
	
	if (sid && !this._sessions[sid.toString()]) {
		this.counts.sessions += 1;
		this._sessions[sid.toString()] = true;
	}
	
	var m = { 'idx': idx, 'msg': msg, 'msg_present': parsed_msg, 'ctx': ctx, 'sid': sid };
	this.msg_archive.push(m);
	
	return m;
};

Exclaim.prototype.bufferMessage = function(msg) {
	this.msg_buffer.push(msg);
};

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
};

Exclaim.prototype.flushArchive = function() {
	this.msg_archive.length = 0;
	this.lastIdx = null;
};

Exclaim.prototype.logMessage = function(msg, replay) {
	this.counts.presented += 1;
	var now = timestamp();
	var sid = msg.sid;
	
	if (sid != this.lastSid) {
		this.lastSid = sid;
		this.sidColor = diffRandColor(this.sidColor);
	}	
	
	var msg_header = replay ? clc.italic(`[${now} ${sid}]`) : clc.bold(`[${now} ${sid}]`);
	
	if (this.sidColor) {
		msg_header = clc[this.sidColor](msg_header);
	}
	
	if (this.search_filter != null) {
		this.annotateMessage(msg, this.search_filter);
	}
	
	var _msg = msg_header + (msg.ctx != null ? clc.bold(`[${msg.ctx}] `) : ' ') + msg.msg_present;
	present(_msg);
};

Exclaim.prototype.replayLog = function(msgCount, sid) {
	var target_msgs = [];
	var archive = this.msg_archive;
	
	// Split out records relevant only to one Session ID
	if (sid != null) {
		archive = this.msg_archive.filter((v) => {
			return v.sid == sid;
		});
	}
	
	if (msgCount == null || msgCount == 0) {
		target_msgs = archive.concat();
	} else if (msgCount > 0 && archive.length <= msgCount) {
		target_msgs = archive.concat();
	} else {
		target_msgs = this.sortArchive(archive).slice(msgCount * -1);
	}
	
	for (var mi in target_msgs) {
		var msg = target_msgs[mi];
		if (! this.filterMessage(msg)) this.logMessage(msg, true);
	}
};
	
Exclaim.prototype.sortArchive = function(a) {
	var tgt = a ? a : this.msg_archive;
	return tgt.sort((a, b) => {
		if (a.idx < b.idx) return -1;
		else return 1;
	});
};

Exclaim.prototype.dumpArchive = function(fn, sid) {
	var dump;
	if (sid) dump = this.sortArchive(sid);
	else dump = this.sortArchive();
	
	if (dump.length == 0) return false;
	
	var result = fs.writeSync(fn, JSON.stringify(dump.map((i) => { return { 'msg': i.msg, 'ctx': i.ctx }; })));
	return result;
};

Exclaim.prototype.annotateMessage = function(msg, term) {
	this.counts.annotated += 1;
	
//	msg.msg_present = msg.msg_present.replace(new RegExp(term, 'g'), clc.bold(clc.magentaBright(term)));
	msg.msg_present = msg.msg_present.replace(new RegExp(term, 'g'), clc.inverse(term));
};

// alias some functionality to make testing easier.
Exclaim.prototype.sendCLI = function(cmd) {
	return processCLI(this, cmd);
};

Exclaim.prototype.stats = function() {
	return {
		'total': this.counts.total,
		'filtered': this.counts.filtered,
		'presented': this.counts.presented,
		'annotated': this.counts.annotated,
		'buffer': this.use_buffer ? 1 : 0,
		'buffered': this.msg_buffer.length,
		'archived': this.msg_archive.length,
		'sessions': this.counts.sessions
	};
};

Exclaim.prototype.setFilterTo = function(a, b) {
	this.ctx_filter[0] = a ? a : null;
	this.ctx_filter[1] = b ? b : null;
};

Exclaim.prototype.setSearchTo = function(term, prune) {
	this.search_filter = term ? term : null;
	this.search_prune = prune == true;
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
		filter = filter.join(":");
		
		present(emoji.emojify(`:flashlight:  Context filter SET to '${filter}'.`));
		
		return true;
	} else if (cmd.match(/^\? .+$/)) {
		var search = cmd.match(/^\? (.+)$/);
		if (search[1] && search[1].length > 0) {
			ex.setSearchTo(search[1]);
			present(emoji.emojify(`:flashlight:  Search SET to '${ex.search_filter}'.`));
			
			return true;
		}
	} else if (cmd.match(/^\?\! .+$/)) {
		var search = cmd.match(/^\?\! (.+)$/);
		if (search[1] && search[1].length > 0) {
			ex.setSearchTo(search[1], true);
			
			present(emoji.emojify(`:flashlight:  Prune-Search SET to '${ex.search_filter}'.`));
			
			return true;
		}
	} else if (cmd == '-!' || cmd == '-?') {
		ex.setSearchTo(null);
		present(emoji.emojify(`:flashlight:  Search disabled.`));
		
		return true;
	} else if (cmd == 'x' || cmd == '*' || cmd == '-' || cmd == 'all') {
		// set filter off
		ex.setFilterTo(null, null);
		
		present(emoji.emojify(`:flashlight:  Context filter disabled.`));
		return true;
	} else if (cmd.match(/^\d+$/)) {
		// replay X lines
		var res = cmd.match(/^(\d+)$/);
		var count = res[1];
		if (count < 1) return false;
		ex.replayLog(count);
		
		return true;
	} else if (cmd.match(/^\@.*?(\=\d+)?$/)) {
		// replay session (opt X lines)
		res = cmd.match(/^\@(.*?)(\=\d+)?$/);
		var sid = res[1];
		var count = res[2] > 0 ? res[2] : 0;
		ex.replayLog(count, sid);
		
		return true;
	} else if (cmd == '.') {
		var prompt = modePrompt(ex);
		present(emoji.emojify(`:flashlight:  ${prompt}`));
		present("");
		return true;
	} else {
		return false;
	}
	
	return false;
}

function modePrompt(ex) {
	return [
		"Log Buffer: " + clc.bold(ex.msg_archive.length),
		"Context Filter: " + (ex.ctx_filter[0] == null && ex.ctx_filter[1] == null ? sayMeek('-off-') : describeContextFilter.apply(null, ex.ctx_filter)),
		"Search Filter: " + (ex.search_filter == null ? sayMeek('-off-') : `"${ex.search_filter}"`),
		"Search Mode: " + (ex.search_prune ? "Prune" : "Highlight")
	].join("  ");
}

function describeContextFilter(f0, f1) {
	return [
		f0 == null ? "*" : f0,
		f1 == null ? "*" : f1
	].join(":");
}

function sayMeek(text) {
	return clc.italic(text);
}

function styleMessage(_msg) {
	var ma;
	while(ma = _msg.match(/\{\{([a-z\:]+)\} (.*?)\}\}/)) {
		var style = ma[1];
		var text  = ma[2];
		_msg = _msg.replace( new RegExp('{{' + style + '} ' + ma[2] + '}}', 'g'), styleText(style, text));
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
				present(emoji.emojify(clc.red.bold(":warning:  Unknown command: ") + chunk));
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

function present() {
	// We don't actually need to display anything when
	// running our unit tests...	
	if (process.env.NODE_ENV != 'test' || process.env.EXCLAIM_FORCE_PRESENT == 1) {
		var a = Array.prototype.slice.call(arguments);
		
		console.log.apply(this, a);
	}
}

function diffRandColor(cur) {
	var done = false;
	var new_color = null;
	
	while (! done) {
		var rnd = SUPPORTED_STYLE_COLORS[ Math.floor(Math.random() * SUPPORTED_STYLE_COLORS.length) ];
		if (rnd != cur) {
			new_color = rnd;
			done = true;
		}
	}
	
	return new_color;
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