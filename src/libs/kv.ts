import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'

class KVStore {
    public store = new Map<string, any>()
    private server: Server | null = null
    private apiKey: string | null = null

    private handle(req: IncomingMessage, res: ServerResponse) {
        if (req.method == 'GET') {
            res.writeHead(200)
            res.end(Date.now().toString())
            return
        } else if (req.url && req.method == 'POST' && parse(req.url).pathname == '/updatekv') {
            if(req.headers['content-type'] != 'application/json') {
                res.writeHead(400)
                res.end('Content type should be application/json')
                return
            }

            if (
                !req.headers['authorization'] ||
                this.apiKey == null ||
                req.headers['authorization'] != this.apiKey
            ) {
                console.log(`[KV Store] Attempt blocked from ${req.socket.remoteAddress}`)
                res.writeHead(403)
                res.end('Forbidden')
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

                    for (const key of Object.keys(obj)) {
                        this.store.set(key, obj[key])
                    }

                    res.writeHead(200)
                    res.end('Updated keys')
                    return
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