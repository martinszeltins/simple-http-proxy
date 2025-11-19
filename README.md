## Simple HTTP proxy

A lightweight reverse proxy with automatic multi-core workers and keep-alive connections for high throughput.
Requires Node ≥ 22.0.

```bash
$ node proxy \
    --from localhost:1234 --to localhost:80 --host dave.dev --accept application/json \
    --from localhost:4567 --to localhost:80 --authorization "Bearer e1b42860" --x-custom-header MyValue

[info] HTTP proxy listening on "localhost:1234" forwarding to "localhost:80"
[info] HTTP proxy listening on "localhost:4567" forwarding to "localhost:80"
[info] Starting 16 workers (cores=16)
```

A request to `http://localhost:1234/` will be forwarded to `http://localhost:80/` with the `Host` header set to `dave.dev` and the `Accept` header set to `application/json`.

> Note: The specified headers will be either added or overwritten in the proxied request. If the original request contained the header, it will be overwritten. If it did not, the header will be added.

![Screenshot](screenshot.png)
