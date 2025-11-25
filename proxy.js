#!/usr/bin/env node

import http from 'http'
import https from 'https'
import cluster from 'node:cluster'
import os from 'node:os'

const args = process.argv.slice(2)

if (args.length === 0) {
    console.error(
        [
            'Simple HTTP reverse proxy',
            '',
            'Usage:',
            '  proxy \\',
            '    --from host:port --to host:port [--header-name value ...] \\',
            '    --from host:port --to host:port [--header-name value ...]',
            '',
            'Examples:',
            '  proxy --from localhost:1234 --to 100.11.9.50:4567 --host example.com --accept application/json',
            '  proxy --from localhost:4567 --to 100.11.9.50:8456 --authorization "Bearer token" --x-custom-header MyValue',
            '',
            'Notes:',
            '  • Uses all available CPU cores automatically via cluster',
            '  • Reuses keep-alive connections to the origin',
            '  • Original headers are forwarded, CLI headers add/override'
        ].join('\n')
    )
    process.exit(1)
}

const parseMappings = () => {
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
                .slice(2)       // drop leading "--"
                .toLowerCase()
                .replace(/_/g, '-')

            headers[headerName] = headerValue

            j += 2
        }

        const isHttps = targetPort === 443

        const agent = isHttps
            ? new https.Agent({
                  keepAlive: true,
                  maxSockets: 1000,
                  maxFreeSockets: 100,
                  timeout: 60000
              })
            : new http.Agent({
                  keepAlive: true,
                  maxSockets: 1000,
                  maxFreeSockets: 100,
                  timeout: 60000
              })

        mappings.push({
            localHost,
            localPort,
            targetHost,
            targetPort,
            headers,
            agent,
            isHttps
        })

        i = j - 1
    }

    return mappings
}

const mappings = parseMappings()

const startWorkerServers = () => {
    mappings.forEach(mapping => {
        const server = http.createServer((req, res) => {
            const mergedHeaders = {
                ...req.headers,
                ...mapping.headers
            }

            // Force keep-alive towards origin to match the keepAlive Agent
            mergedHeaders.connection = 'keep-alive'

            const options = {
                hostname: mapping.targetHost,
                port: mapping.targetPort,
                path: req.url,
                method: req.method,
                headers: mergedHeaders,
                agent: mapping.agent
            }

            const client = mapping.isHttps ? https : http

            const proxyReq = client.request(options, proxyRes => {
                res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
                proxyRes.pipe(res)
            })

            req.pipe(proxyReq)

            proxyReq.on('error', error => {
                console.error('Proxy request error:', error)
                if (!res.headersSent) {
                    res.writeHead(500)
                }
                res.end('Internal Server Error')
            })
        })

        server.listen(mapping.localPort, () => {
            // Workers stay silent on success
        })

        server.on('error', error => {
            console.error(`Server error on ${mapping.localHost}:${mapping.localPort}`, error)
        })
    })
}

const cpuCount = os.cpus().length

if (cluster.isPrimary) {
    // Print mapping info once, user-friendly
    mappings.forEach(m => {
        console.log(
            `[info] HTTP proxy listening on "${m.localHost}:${m.localPort}" forwarding to "${m.targetHost}:${m.targetPort}"`
        )
    })

    if (cpuCount > 1) {
        console.log(`[info] Starting ${cpuCount} workers (cores=${cpuCount})`)
        for (let i = 0; i < cpuCount; i++) {
            cluster.fork()
        }

        cluster.on('exit', (worker, code, signal) => {
            console.error(`worker ${worker.process.pid} exited with code ${code} signal ${signal}`)
            // If you want auto-restart, uncomment:
            // cluster.fork()
        })
    } else {
        // Single-core machine, just run in primary
        startWorkerServers()
    }
} else {
    // Worker process: just start servers, no extra logging
    startWorkerServers()
}
