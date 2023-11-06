import 'dotenv/config.js'
import { launch, Page } from 'puppeteer-core'
import Router, { NewMessageData, ProcessingInput, ProcessingOutput } from './router.js'
import { removeImagesAndCss } from './common.js'
import Queue from './libs/queue.js'
import KVStore from './libs/kv.js'

import calc from './handlers/calc.js'
import define from './handlers/define.js'
import wordle from './handlers/wordle.js'
import busyResponder from './handlers/busyResponder.js'
import count from './handlers/count.js'
import callme from './handlers/callme.js'
import runCommand from './handlers/run.js'
import cache from './handlers/cache.js'
import summarize from './handlers/summarize.js'
import what from './handlers/what.js'
import translate from './handlers/translate.js'

const kvStore = new KVStore()
async function run() {
    Router.registerCommandHandler(['define'], define)
    Router.registerCommandHandler(['calc', 'resetcalc'], calc)
    Router.registerCommandHandler(['newwordle', 'g', 'reveal', 'tries'], wordle)
    Router.registerCommandHandler(['callme'], callme)
    Router.registerCommandHandler(['run'], runCommand)
    Router.registerCommandHandler(['summarize'], summarize)
    Router.registerCommandHandler(['what'], what)
    Router.registerCommandHandler(['*', 'translate_me', 'set_language'], translate)
    Router.registerCommandHandler(['*'], busyResponder)
    Router.registerCommandHandler(['*'], count)
    Router.registerCommandHandler(['*'], cache)
    Router.registerKVStore(kvStore)

    const processingQueue = new Queue<ProcessingInput, Promise<ProcessingOutput[]>>({
        processFunc: Router.processMessage.bind(Router),
        sequential: false
    })

    const outputQueue = new Queue<ProcessingOutput, Promise<void>>({
        processFunc: Router.writeToMessenger.bind(Router),
        sequential: true
    })

    processingQueue.on('result', (r) => {
        if (r.error) {
            console.error(r.data as Error)
            return
        }

        for (const result of r.data as ProcessingOutput[]) {
            outputQueue.enqueue(result as ProcessingOutput)
        }
    })

    outputQueue.on('result', (r) => {
        if (r.error) {
            console.error(r.data as Error)
        }
    })

    const dockerArgs = process.env.IS_DOCKER ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-zygote',
        '--single-process',
        '--disable-dev-shm-usage',
        ...(process.env.ALL_PROXY ? [`--proxy-server=${process.env.ALL_PROXY}`] : [])
    ] : []

    const browser = await launch({
        headless: process.env.NODE_ENV == 'production',
        executablePath: process.env.CHROME_BIN,
        ignoreHTTPSErrors: true,
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--disable-speech-api',
            '--disable-background-networking',
            ...dockerArgs
        ],
        ignoreDefaultArgs: ['--mute-audio']
    })

    const page = await browser.newPage()
    page.setRequestInterception(true)
    page.setCacheEnabled(false)
    page.on('request', removeImagesAndCss)

    const myUid: string = await initializeCookies()
    await startParsingMessages(myUid)

    kvStore.on('webhookMessage', (m) => {
        console.log(`[Webhooks] Sending ${m.to} message "${m.message}"`)
        outputQueue.enqueue({
            uid: m.to,
            response: m.message,
            browser
        })
    })

    setInterval(() => page.reload(), 30 * 60 * 1000)

    async function startParsingMessages(accountUid: string) {
        page.on('load', () => {
            page.evaluate(() => {
                document.body.innerHTML = ''
            })
        })

        await page.goto('https://messenger.com')

        const cdp = await page.target().createCDPSession()
        await cdp.send('Network.enable')
        await cdp.send('Page.enable')

        cdp.on('Network.webSocketFrameReceived', async ({ response }) => {
            const buf = Buffer.from(response.payloadData, 'base64')
            const str = buf.toString('utf-8')

            if (!str.includes('{')) {
                return
            }

            const rawJSON = str.slice(str.indexOf('{'))

            let obj
            try {
                obj = JSON.parse(rawJSON)
            } catch (_) {
                return
            }

            if (obj.request_id === undefined || obj.request_id !== null) return
            const payload = JSON.parse(obj.payload)

            const data = extractNewMessageInfo(payload, accountUid, page)
            if (data) {
                console.log(data)
                processingQueue.enqueue({ type: 'new_message', data, browser })
            }
        })
    }

    async function initializeCookies(): Promise<string> {
        try {
            const fbJson = Buffer.from(process.env.COOKIES ?? '', 'base64').toString('utf-8')
            const messengerJson = Buffer.from(process.env.MESSENGER_COOKIES ?? '', 'base64').toString('utf-8')
            const fbCookies = JSON.parse(fbJson)
            const messengerCookies = JSON.parse(messengerJson)
            //@ts-ignore
            const uid = fbCookies.filter(o => o.name == 'c_user')[0].value
            if (typeof uid !== 'string') throw new Error('Assertion: myUid was not string')
            await page.setCookie(...fbCookies.concat(messengerCookies))

            return uid
        } catch (_) {
            console.error('Failed to parse cookies')
        }

        return ''
    }
}

function bfs(items: any[], keys: string[]): { [key: string]: any[][] } {
    const results: { [key: string]: any[][] } = {}
    const queue = [items]

    let queueItem
    while ((queueItem = queue.pop()) !== undefined) {
        for (const it of queueItem) {
            if (Array.isArray(it)) {
                let found = false

                for (const key of keys) {
                    if (typeof it[1] === 'string' && it[1] === key) {
                        if (results[key] === undefined) {
                            results[key] = []
                        }

                        results[key].push(it)
                        found = true
                    }
                }

                if (!found) queue.push(it)
            }
        }
    }

    return results
}

function extractNewMessageInfo(payload: any, myUid: string, page: Page): NewMessageData | null {
    const results = bfs(payload.step, ['insertMessage', 'insertBlobAttachment'])
    if (Object.keys(results).length <= 0 || !results['insertMessage']) return null

    const insertMessageResult = results['insertMessage'][0]

    let message = insertMessageResult[2]

    if (typeof message === 'string') { }
    else if (Array.isArray(message) && message[0] === 9) message = ''
    else return null

    const senderUid = insertMessageResult[12][1]
    const threadId = insertMessageResult[5][1]
    const messageId = insertMessageResult[10]

    if (typeof senderUid !== 'string') return null
    if (typeof threadId !== 'string') return null
    if (typeof messageId !== 'string') return null

    const attachments: string[] = []

    if (results['insertBlobAttachment']) {
        for (const attachment of results['insertBlobAttachment']) {
            if (attachment !== undefined) {
                attachments.push(attachment[5])
            }
        }
    }

    return {
        message,
        messageId,
        senderUid,
        uid: threadId,
        attachments,
        isBot: message.startsWith('\u200E'),
        isSelf: senderUid === myUid,
        isGroupChat: !threadId.startsWith('100')
    } as NewMessageData
}

run()

if (process.env.KV_API_KEY) {
    kvStore.serve(parseInt(process.env.PORT ?? '8080'), process.env.KV_API_KEY)
} else {
    console.log('No KV_API_KEY, KV service will not be started')
}

console.log('[Server] Started')

export { }
