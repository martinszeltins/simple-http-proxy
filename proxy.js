#!/usr/bin/env node

import http from 'http'

const args = process.argv.slice(2)

if (args.length === 0) {
    console.error(
        [
            'Usage:',
            '  proxy \\',
            '    --from host:port --to host:port [--header-name value ...] \\',
            '    --from host:port --to host:port [--header-name value ...]',
            '',
            'Examples:',
            '  proxy --from localhost:1234 --to 100.11.9.50:4567 --host example.com --accept application/json',
            '  proxy --from localhost:4567 --to 100.11.9.50:8456 --authorization "Bearer token" --x-custom-header MyValue'
        ].join('\n')
    )
    process.exit(1)
}

const mappings = []

for (let i = 0; i < args.length; i++) {
    const flag = args[i]

    if (flag !== '--from') {
        console.error(`Unexpected argument "${flag}". Expected "--from"`)
        process.exit(1)
    }

    const fromValue = args[i + 1]
    const toFlag = args[i + 2]
    const toValue = args[i + 3]

    if (!fromValue || toFlag !== '--to' || !toValue) {
        console.error('Each "--from host:port" must be followed by "--to host:port"')
        process.exit(1)
    }

    const [fromHostRaw, fromPortStr] = fromValue.split(':')
    const localHost = fromHostRaw || 'localhost'
    const localPort = parseInt(fromPortStr || '', 10)

    if (Number.isNaN(localPort)) {
        console.error(`Invalid local port in "--from": ${fromValue}`)
        process.exit(1)
    }

    const [targetHost, targetPortStr] = toValue.split(':')
    const targetPort = parseInt(targetPortStr || '', 10)

    if (!targetHost || Number.isNaN(targetPort)) {
        console.error(`Invalid target in "--to": ${toValue}. Expected "host:port"`)
        process.exit(1)
    }

    const headers = {}

    // Collect header overrides until the next "--from" or end
    let j = i + 4
    while (j < args.length && args[j].startsWith('--') && args[j] !== '--from') {
        const headerFlag = args[j]
        const headerValue = args[j + 1]

        if (headerValue === undefined) {
            console.error(`Missing value for header flag "${headerFlag}"`)
            process.exit(1)
        }

        const headerName = headerFlag
            .slice(2) // drop leading "--"
            .toLowerCase()
            .replace(/_/g, '-')

        headers[headerName] = headerValue

        j += 2
    }

    mappings.push({
        localHost,
        localPort,
        targetHost,
        targetPort,
        headers
    })

    i = j - 1
}

mappings.forEach(mapping => {
    const server = http.createServer((req, res) => {
        const mergedHeaders = {
            ...req.headers,
            ...mapping.headers
        }

        const options = {
            hostname: mapping.targetHost,
            port: mapping.targetPort,
            path: req.url,
            method: req.method,
            headers: mergedHeaders
        }

        const proxyReq = http.request(options, proxyRes => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
            proxyRes.pipe(res)
        })

        req.pipe(proxyReq)

        proxyReq.on('error', error => {
            console.error('Proxy request error:', error)
            res.writeHead(500)
            res.end('Internal Server Error')
        })
    })

    server.listen(mapping.localPort, mapping.localHost, () => {
        const headersInfo =
            Object.keys(mapping.headers).length > 0
                ? ` with header overrides: ${JSON.stringify(mapping.headers)}`
                : ''

        console.log(
            `HTTP proxy listening on http://${mapping.localHost}:${mapping.localPort} forwarding to ${mapping.targetHost}:${mapping.targetPort}${headersInfo}`
        )
    })
})
