#!/usr/bin/env ts-node

import http from 'http'

interface Mapping {
    localPort: number
    targetHost: string
    targetPort: number
}

const args = process.argv.slice(2)
if (args.length === 0) {
    console.error('Usage: ts-node proxy.ts localPort:targetHost:targetPort [localPort:targetHost:targetPort ...]')
    process.exit(1)
}

const mappings: Mapping[] = args.map(arg => {
    const parts = arg.split(':')
    if (parts.length !== 3) {
        console.error(`Invalid mapping format: ${arg}. Expected format is localPort:targetHost:targetPort`)
        process.exit(1)
    }
    const [localPortStr, targetHost, targetPortStr] = parts
    const localPort = parseInt(localPortStr, 10)
    const targetPort = parseInt(targetPortStr, 10)
    if (isNaN(localPort) || isNaN(targetPort)) {
        console.error(`Invalid port numbers in mapping: ${arg}`)
        process.exit(1)
    }
    return { localPort, targetHost, targetPort }
})

mappings.forEach(mapping => {
    const server = http.createServer((req, res) => {
        const options = {
            hostname: mapping.targetHost,
            port: mapping.targetPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
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

    server.listen(mapping.localPort, () => {
        console.log(
            `HTTP proxy listening on http://localhost:${mapping.localPort} forwarding to ${mapping.targetHost}:${mapping.targetPort}`
        )
    })
})
