var assert = require('simple-assert');
var Lie = require('lie');
var request = require('request');

var Exclaim = require('../exclaim');

var exclaim;

describe("Mocha OK", () => {
	it("Assertions should work", () => { assert(true); });
	it("We can fire up our exclaim listener", (done) => {
		assert(Exclaim);
		assert(exclaim = new Exclaim(process.env.TEST_HOST, process.env.TEST_PORT, done));
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
			
			if(! (res[1].msg.idx > 0)) return done("idx invalid");
			done();
		});
	});
	
	it("We can send messages w/ contexts", function(done) {
		_post('/log', { 'msg': "Hello, Exclaim!", 'ctx': "test:ctx" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msg.idx > 0)) return done("idx invalid");
			if(res[1].msg.ctx != "test:ctx") return done("Context not recognized " + JSON.stringify(res[1]));
			done();
		});		
	});
	
	it("We can send messages with Emoji", function(done) {
		_post('/log', { 'msg': ":flag-us: :flag-us: USA! USA!!" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msg.idx > 0)) return done("idx invalid");
			done();
		});		
	});
	
	it("We can send messages with styling", function(done) {
		_post('/log', { 'msg': "This element should be bold/cyan -> {{bold:cyan} element!}}, and this inversed -> {{inverse} Inverse Me!}}" }).then((res) => {
			if (res[0]) return done(res[2]);
			if(res[1].success !== true) return done("Success not TRUE");
			if(! (res[1].msg.idx > 0)) return done("idx invalid");
			done();
		});			
	});
	
	it("We can [if we wanted] pull stats on our exclaim instance", function(done) {
		_get('/stats', {}).then((res) => {
			if (res[0]) return done(res[2]);
			if(typeof res[1] != 'object') return done("Data returned was not JSON");
			if(! (res[1].archived == 0)) return done("Stats aren't properly counting.");
			done();
		});			
	});
});

describe("ContextFilter functionality", () => {
	it("With context filter set, ensure msg gets through", function(done) {
		exclaim.setFilterTo('mocha', 'test');
		var st = exclaim.stats().presented;
		_post('/log', { 'msg': "TEST MESG - SEE ME 1", 'ctx': "mocha:test" }).then((res) => {
			if (exclaim.stats().presented != st + 1) {
				done("Message was not presented and it should have been!");
			} else {
				done();
			}
		});				
	});
	
	it("With context filter set, ensure msg gets filtered", function(done) {
		exclaim.setFilterTo('mocha', 'test');
		var st = exclaim.stats().presented;
		var fst = exclaim.stats().filtered;
		
		_post('/log', { 'msg': "TEST MESG - DONT SEE ME 2", 'ctx': "not_mocha:test" }).then((res) => {
			if (exclaim.stats().presented != st || exclaim.stats().filtered != fst + 1) {
				done("Message was presented and it shouldnt have been!");
			} else {
				done();
			}
		});		
	});
	
	it("With context filter unset, ensure msgs gets through", function(done) {
		exclaim.setFilterTo(null, null);
		var st = exclaim.stats().presented;
		_post('/log', { 'msg': "TEST MESG - SEE ME 3", 'ctx': "not_mocha:test" }).then((res) => {
			if (exclaim.stats().presented != st + 1) {
				done("Message was presented and it should have been!");
			} else {
				done();
			}
		});
	});
});

describe("Search Functionality", () => {
	it("With 'passive' search activated, we should get messages with terms highlighted", function(done) {
		exclaim.setSearchTo('foobar');
		var at = exclaim.stats().annotated;
		var ft = exclaim.stats().filtered;
		
		_post('/log', { 'msg': "Lets find the foobars in this foobar message" }).then((res) => {
			if (exclaim.stats().annotated == at) {
				done("Message was not marked as annotated");
			} else {
				if (exclaim.stats().filtered > ft) {
					done("Message was filtered and it shouldn't have been");
				} else {
					done();
				}
			}
		});
	});
	
	it("With 'pruning' search activated, we should only get messages with terms present", function(done) {
		exclaim.setSearchTo('foobar', true);
		if (! exclaim.search_prune == true) done("search_prune was not enabled");
		
		var at = exclaim.stats().annotated;
		var ft = exclaim.stats().filtered;
		
		_post('/log', { 'msg': "Lets find the foobars in this foobar message and ignore everything else" }).then((res) => {
			if (exclaim.stats().annotated == at) {
				done("Message was not marked as annotated");
			} else {
				if (ft > exclaim.stats().filtered) {
					done("Message was filtered and it shouldn't have been.");
				}
				at = exclaim.stats().annotated;
				pt = exclaim.stats().presented;
				
				ft = exclaim.stats().filtered;
				_post('/log', { 'msg': "This message does not contain the term so it should't be displayed" }).then((res) => {
					if (exclaim.stats().annotated > at) {
						done("Message was annotated and it shouldn't have been");
					} else if (exclaim.stats().presented > pt) {
						done("Message was presented and it shouldn't have been");
					} else if (exclaim.stats().filtered == ft) {
						done("Message was not marked as filtered and it should've been");
					} else {
						done();
					}
				}).catch(done);
			}
		}).catch(done);		
	});
	
	after("Disabling search", () => {
		exclaim.setSearchTo(null);
	});
});

describe("Replay Functionality", (done) => {
	it("We can replay x # of lines of raw log data", () => {
		var num_msgs = 8;
		_log_many(num_msgs).then(() => {
			var pt = exclaim.stats().presented;
			if (pt != num_msgs) done("Messages not delivered.");
			
			exclaim.replayLog(5);
			if (pt != num_sgs + 5) done("Messages did not replay.");
			done();
		});
	});
	
	it("We can replay x # of lines of raw log data from one SID", () => {
		_log_many(25, 'aaa').then(() => { _log_many(15, 'bbb') }).then(() => {
			var pt = exclaim.stats().presented;
			if (pt != 40) done("Messages not delivered.");
			
			exclaim.replayLog(null, 'bbb');
			if (pt != 55) done("Messages did not replay right " + pt);
		});
	});
});

describe("CLI Functionality", () => {
	it("We can send bad commands to our CLI handler", () => {
		assert(! exclaim.sendCLI("demo"));
	});
	
	it("We can send commands to our CLI handler to change our filter", () => {
		assert( exclaim.sendCLI("app:*") );
	});
	
	it("We can send commands to our CLI handler to change our search mode", () => {
		assert( exclaim.sendCLI("app:*") );
	});
});

describe("Session Functionality", () => {
	it("We can establish a new logging session, which will register w/ our instance", (done) => {
		var sc = exclaim.stats().sessions;
		
		_post('/log', { msg: '123455', 'sid': 'abc' }).then((resp) => {
			_post('/log', { 'msg': '67123', 'sid': 'abcd' }).then((resp) => {
				_log_many(55, 'abc').then((v) => {
					if (exclaim.stats().sessions != sc + 2) done("Sessions count not as expected -> " + (exclaim.stats().sessions - sc));
					else done();
				});
			});
		});
	});
});

describe("Buffer Functionality", () => {
	it("We can enable buffering and messages won't present", function(done) {
		this.timeout(3000);
		exclaim.setFilterTo(null, null);
		exclaim.useBuffer(true);
		assert(exclaim.stats().buffer == 1);
		
		var st = exclaim.stats().presented;
		
		_post('/log', { 'msg': "I'm Buffered" }).then((res) => {
			if (exclaim.stats().presented != st) {
				done("Message was presented and it should have been buffered!");
			} else if (exclaim.stats().buffered == 0) {
				done("Message wasn't buffered and it should have been!");
			} else {
				// make sure it doesn't pop out..
				setTimeout(done, 1500);
			}
		});
	});
	
	it("When we disable buffering, messages should present", function() {
		var st = exclaim.stats().presented;
		exclaim.useBuffer(false);
		
		assert(exclaim.stats().presented == st + 1);
	});
});

describe("Persistence Functionality", () => {
	it("We can commit all of our logs to disk to review later");
	it("We can choose specific sessions to commit to disk");
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
};

var _log_many = (num_msgs, sid) => {
	var posts = [];
	
	for (var i = 0; i < num_msgs; i++) {
		posts.push(
			_post("/log", { msg: Math.random().toString(36), sid: sid} )
		);
	}
	
	return Lie.all(posts);
};