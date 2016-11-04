function staticPost(methodName) {
	if (! methodName) methodName = 'exclaim';
return `
function ${methodName}(msg, ctx) {
	var uri = '/log';
	var args = { 'msg': msg, 'ctx': ctx ? ctx : '-' };
	var arg_string = [];
	for (var ak in args) {
		arg_string.push( ak + "=" + encodeURIComponent(args[ak]) );
	}

	var url = uri + '?' + arg_string.join("&");
	_${methodName}_post(url);
}

function _${methodName}_post(a,b){return b=new XMLHttpRequest,b.open("POST",a),a=[],b.onreadystatechange=b.then=function(c,d,e,f){if(c&&c.call&&(a=[,c,d]),4==b.readyState&&(e=a[0|b.status/200])){try{f=JSON.parse(b.responseText)}catch(g){f=null}e(f,b)}},b.send(),b}`;
}

module.exports.postJS = staticPost;