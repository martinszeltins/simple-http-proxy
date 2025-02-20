## Simple HTTP proxy

Requires Node >= 22.0

```bash
$ node --experimental-strip-types proxy.ts 4567:100.11.9.50:4567 3000:100.11.9.50:3000

HTTP proxy listening on http://localhost:4567 forwarding to 100.11.9.50:4567
HTTP proxy listening on http://localhost:3000 forwarding to 100.11.9.50:3000
```
