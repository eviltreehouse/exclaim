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

var msgId = 0;

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
	
	logMessage(msg);
	
	return { success: true, msgId: ++msgId, context: ctx, msgLen: msg.msg.length };
}

function processMessage(_msg, ctx) {
	var parsed_msg = emoji.emojify(_msg);
	
	return { 'msg': parsed_msg, 'ctx': ctx };
}

function logMessage(msg) {
	var _msg = msg.ctx != null ? `[${msg.ctx}] ${msg.msg}` : `${msg.msg}`;
	console.log( styleText('cyan', _msg));
}

function styleText(context, msg) {
	var f = clc[context+'Bright'];
	f = f['bold'];
	
	return f(msg); // @FIXME - we need to support bold/underline/etc too..
}



var server = http.createServer(handleRequest);

function serve(host, port, cb) {
	if (! host) host = '127.0.0.1';
	if (! port) port = DEFAULT_PORT;
	
	server.listen(port, host, function() {
		console.log('Ready on %s:%s %s', host, port, emojis.heart);
		if (cb) cb();
	});
	
	msgId = 0;
	
	return true;
}

// Either fire immediately or wait to be invoked.
if (require.main === module) {
	serve();
} else {
	module.exports = serve;
}