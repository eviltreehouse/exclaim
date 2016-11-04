#!/usr/bin/env node

var http = require('http');
var url = require('url');
var qs = require('querystring');
var emoji  = require('node-emoji');
var clc    = require('cli-color');

var emojis = emoji.emoji;

var static = require('./exclaim-static');

const DEFAULT_PORT = 8010;
const DEBUG = process.env.DEBUG ? true : false;
const SUPPORTED_STYLE_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const SUPPORTED_STYLE_TYPES  = ['bold', 'italic', 'underline', 'blink', 'inverse', 'strike'];

var server;
var msgId = 0;
var use_buffer = false;
var msg_buffer = [];

var active_filters = [];

function handleRequest(request, response) {
	//var req = url.parse(request.url, true);
	if (DEBUG) console.log(request.method + ' -> ' + request.url);
	
	post_body = '';
	
	if (request.url == '/exclaim.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end( static.postJS() );
		return;
	}
	
	if (request.method == 'POST') {
		request.on('data', (chunk) => {
			post_body += chunk.toString();
		});
		
		request.on('end', () => {
			post_body = qs.parse(post_body);
			if (Object.keys(post_body).length == 0) post_body = url.parse(request.url, true).query;
			if (DEBUG) console.log('POST BODY:\n', post_body);
			response.end(
				JSON.stringify( parseRequest( url.parse(request.url).pathname, post_body) )
			);
		});
//	} else {
//		response.end('{"success":false}');
	}
	
	//console.log("request=>\n", request);
}

function parseRequest(url, body) {
	if (url != '/log') {
		if (DEBUG) console.log("??? Non /log request", url);
		return { success: false };
	}
	
	var ctx = null;
	if (body['ctx']) ctx = body['ctx'].toString().toLowerCase();

	var raw_msg = body['msg'];
	
	var msg = processMessage(raw_msg, ctx);
	if (DEBUG) console.log( '> IN MSG:', `[${ctx}]`, raw_msg );
	
	if (! filterMessage(msg)) {
		if (use_buffer) bufferMessage(msg); 
		else logMessage(msg);
	}
	
	return { success: true, msgId: ++msgId, context: ctx, msgLen: msg.msg.length };
}

function filterMessage(msg) {
	// to do: use any filters we have and return `true` if we want to ignore it.
	return false;
}

function processMessage(_msg, ctx) {
	var styled_msg = styleMessage(_msg);
	var parsed_msg = emoji.emojify(styled_msg);
	
	return { 'msg': parsed_msg, 'ctx': ctx };
}

function bufferMessage(msg) {
	msg_buffer.push(msg);
}

function flushBuffer() {
	// protect against sudden re-engagement
	var siz = msg_buffer.length;
	
	for (var i = 0; i < siz; i++) {
		logMessage(msg_buffer.shift());
	}
	
	if ( (! use_buffer) && msg_buffer.length > 0) {
		// recurse if something showed up and its 
		// okay to display.
		flushBuffer();
	}
}

function logMessage(msg) {
	var _msg = msg.ctx != null ? clc.bold(`[${msg.ctx}]`) + ` ${msg.msg}` : `${msg.msg}`;
	console.log(_msg);
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


function serve(host, port, cb) {
	server = http.createServer(handleRequest);
	if (! host) host = '127.0.0.1';
	if (! port) port = DEFAULT_PORT;
	
	server.listen(port, host, function() {
		console.log('Ready on %s:%s %s', host, port, emojis.heart);
		if (cb) cb();
	});
	
	msgId = 0; msg_buffer.length = 0;
	use_buffer = false;
	
	return true;
}

// Either fire immediately or wait to be invoked.
if (require.main === module) {
	serve();
} else {
	module.exports = serve;
}