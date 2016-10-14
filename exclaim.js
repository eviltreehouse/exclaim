#!/usr/bin/env node

var http = require('http');
var url = require('url');
var qs = require('querystring');
var emoji  = require('node-emoji');
var emojis = emoji.emoji;


const PORT=8001;

function handleRequest(request, response) {
	//var req = url.parse(request.url, true);
	console.log(request.method + ' -> ' + request.url);
	
	post_body = '';
	
	if (request.method == 'POST') {
		request.on('data', (chunk) => {
			post_body += chunk.toString();
		});
		
		request.on('end', () => {
			post_body = qs.parse(post_body);
			console.log('POST BODY:\n', qs.parse(post_body));
			response.end(JSON.stringify( parseRequest(request.url, post_body) ));
		});
	} else {
		response.end('{"success":false}');
	}
	
	//console.log("request=>\n", request);
}

function parseRequest(url, body) {
	if (url != '/log') return { success: false };
	console.log(body);
	
	console.log( emoji.emojify(body['msg']) );
	return { success: true };
}

var server = http.createServer(handleRequest);

server.listen(PORT, function() {
	console.log('Ready on %s %s', PORT, emojis.heart);
});