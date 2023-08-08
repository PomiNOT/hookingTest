import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { EventEmitter } from 'events'
import TypedEmitter from 'typed-emitter'
import { parse } from 'url'

type MessageEvents = {
    webhookMessage: (m: Message) => void
}

interface Message {
    to: string,
    message: string
}

class KVStore extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    public store = new Map<string, any>()
    private server: Server | null = null
    private apiKey: string | null = null

    private handle(req: IncomingMessage, res: ServerResponse) {
        if (req.method == 'GET') {
            res.writeHead(200)
            res.end(Date.now().toString())
            return
        }
        
        if (req.url && req.method == 'POST') {
            if (
                !req.headers['authorization'] ||
                this.apiKey == null ||
                req.headers['authorization'] !== this.apiKey
            ) {
                console.log(`[KV Store] Attempt blocked from ${req.socket.remoteAddress}`)
                res.writeHead(403)
                res.end('Forbidden')
                return
            }

            const pathname = parse(req.url).pathname

            if (pathname !== '/updatekv' && pathname !== '/send') {
                res.writeHead(400)
                res.end('Invalid operation')
                return
            }

            let content = ''

            req.setEncoding('utf-8')
            req.on('data', chunk => {
                content += chunk
            })

            req.on('close', () => {                
                try {
                    const obj = JSON.parse(content) as { [k: string]: any }

                    if (pathname === '/updatekv') {
                        for (const key of Object.keys(obj)) {
                            this.store.set(key, obj[key])
                        }

                        res.writeHead(200)
                        res.end('Updated keys')
                        return
                    } else if (pathname === '/send') {
                        const { to, message } = obj
                        if (
                            typeof to !== 'string' ||
                            typeof message !== 'string'
                        ) throw new Error()

                        this.emit('webhookMessage', {
                            to,
                            message
                        })

                        res.writeHead(200)
                        res.end('Received')
                        return
                    }

                } catch(_) {
                    res.writeHead(400)
                    res.end('Malformed body')
                    return
                }
            })
        } else {
            res.writeHead(405)
            res.end('Method Not Allowed')
        }
    }

    public serve(port: number, apiKey: string) {
        this.apiKey = apiKey

        if (!this.server) {
            this.server = createServer(this.handle.bind(this))
            this.server.listen(port, () => {
                console.log('[KV Server] Started')
            })
            this.server.on('close', () => {
                console.log('[KV Server] Closed')
                this.server = null
            })
            return this.server
        } else {
            throw new Error('Server already started')
        }
    }
}

export default KVStore