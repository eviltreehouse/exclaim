## Exclaim Engineering Notes

### Emoji Manifest
https://raw.githubusercontent.com/omnidan/node-emoji/master/lib/emoji.json

### UTF8 Bytes -> Unicode

```
var be = new Buffer([0xF0, 0x9F, 0xA4, 0x98]); // 4 byte UTF-8
var escaped = escape(be); // '%F0%9F%A4%98'
document.write(decodeURIComponent(escaped))
```
