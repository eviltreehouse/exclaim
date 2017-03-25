function staticPost(methodName) {
	if (! methodName) methodName = 'exclaim';
	return `
!function(w) {
	const CLIENT_ID = Math.random().toString('32').toUpperCase().replace(/^0\./, '');
	var SESSION_ID = null;
	var EXCLAIM_HOST = null;
//	var EXCLAIM_HOST = 'http://localhost:18101';

	function ${methodName}(msg, ctx) {
		var uri = '/log';
		var args = { 'msg': msg, 'ctx': ctx ? ctx : '-', 'sid': SESSION_ID };
		var arg_string = [];
		for (var ak in args) {
			arg_string.push( ak + "=" + encodeURIComponent(args[ak]) );
		}

		var url = EXCLAIM_HOST + uri + '?' + arg_string.join("&");
		return _post(url);
	}

	function ${methodName}Next(sid) {
		if (! sid) {
			sid = Math.floor(Date.now() / 1000).toString('16').toUpperCase();
			SESSION_ID = [CLIENT_ID, sid].join("");
		} else {
			SESSION_ID = sid;
		}

		return ${methodName};
	} 

	function ${methodName}Context(ctx) {
		return function(msg) {
			return ${methodName}(msg, ctx);
		};
	}

	function ${methodName}Config(host, port) {
		if (host && !port) {
			EXCLAIM_HOST = host;
		} else {
			EXCLAIM_HOST = [ host, port ].join(":");
		}
	}

	function _post(a,b){return b=new XMLHttpRequest,b.open("POST",a),a=[],b.onreadystatechange=b.then=function(c,d,e,f){if(c&&c.call&&(a=[,c,d]),4==b.readyState&&(e=a[0|b.status/200])){try{f=JSON.parse(b.responseText)}catch(g){f=null}e(f,b)}},b.send(),b}

	w.${methodName} = ${methodName};
	w.${methodName}Context = ${methodName}Context;
	w.${methodName}Config = ${methodName}Config;

}(this);
`;
	}

module.exports.postJS = staticPost;