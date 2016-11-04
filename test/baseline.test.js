var assert = require('simple-assert');
var Lie = require('lie');
var request = require('request');

var exclaim = require('../exclaim');

describe("Mocha OK", () => {
	it("Assertions should work", () => { assert(true); });
	it("We can fire up our exclaim listener", (done) => {
		assert(exclaim);
		assert(exclaim(process.env.TEST_HOST, process.env.TEST_PORT, done));
	});
});

describe("Core Functionality", () => {
	it("We can pull our client adapter", function(done) {
		_get('/exclaim.js').then((err, body, err_msg) => {
			if (err) {
				done(err_msg);
			} else {
				if (! /_exclaim_post_/.test(body)) done('JavaScript seems incorrect.');
				done();
			}
		});
	});
	
	it("We can send simple messages", function(done) {
		_post('/log', { 'msg': "Hello, Exclaim!" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msgId > 0)) return done("msgId invalid");
			done();
		});
	});
	
	it("We can send messages w/ contexts", function(done) {
		_post('/log', { 'msg': "Hello, Exclaim!", 'ctx': "test:ctx" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msgId > 0)) return done("msgId invalid");
			if(res[1].context != "test:ctx") return done("Context not recognized " + JSON.stringify(res[1]));
			done();
		});		
	});
	
	it("We can send messages with Emoji", function(done) {
		_post('/log', { 'msg': ":flag-us: :flag-us: USA! USA!!" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msgId > 0)) return done("msgId invalid");
			done();
		});		
	});
	
	it("We can send messages with styling", function(done) {
		_post('/log', { 'msg': "This element should be bold/cyan -> {{bold:cyan} element!}}, and this inversed -> {{inverse} Inverse Me!}}" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msgId > 0)) return done("msgId invalid");
			done();
		});			
	});
});


var _post = (uri, _opts) => {
	if (! _opts) _opts = {};
	var lie = new Lie((resolve) => {
		var opts = {};
		opts['url'] = 'http://' + [process.env.TEST_HOST, process.env.TEST_PORT].join(":") + uri;
		//opts['qs']  = _opts;
		//console.log(opts['url']);

		request.post(opts['url'], {'form':_opts}, (err, resp, body) => {
			if (err) {
				console.log(err.message);
				resolve(
				[ true, {}, err.messsage ]);
			} else {
				if (resp.statusCode == 200) {
					var b = '';
					try {
						b = JSON.parse(body);
					} catch(e) {
						b = body;
					}
					
					resolve([null, b, err]);
				} else {
					resolve([ resp.statusCode, body, err] );
				}
			}
		});
	})

	return lie;
} 

var _get = (uri, _opts) => {
	if (! _opts) _opts = {};
	var lie = new Lie((resolve) => {
		var opts = {};
		opts['url'] = 'http://' + [process.env.TEST_HOST, process.env.TEST_PORT].join(":") + uri;
		opts['qs']  = _opts;
		//console.log(opts['url']);

		request.get(opts, (err, resp, body) => {
			if (err) {
				console.log(err.message);
				resolve(
				[ true, {}, err.messsage ]);
			} else {
				if (resp.statusCode == 200) {
					var b = '';
					try {
						b = JSON.parse(body);
					} catch(e) {
						b = body;
					}
					
					resolve([null, b, err]);
				} else {
					resolve([ resp.statusCode, body, err] );
				}
			}
		});
	})

	return lie;
} 