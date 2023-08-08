import 'dotenv/config.js'
import { launch, Page } from 'puppeteer-core'
import Router, { AttachmentIterator, AttachmentIteratorResult, Attachments, MessageData, NewMessageData, ProcessingInput, ProcessingOutput, TypingData, UnsentData } from './router.js'
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

const kvStore = new KVStore()
async function run() {
    Router.registerCommandHandler(['define'], define)
    Router.registerCommandHandler(['calc', 'resetcalc'], calc)
    Router.registerCommandHandler(['newwordle', 'g', 'reveal', 'tries'], wordle)
    Router.registerCommandHandler(['callme'], callme)
    Router.registerCommandHandler(['run'], runCommand)
    Router.registerCommandHandler(['summarize'], summarize)
    Router.registerCommandHandler(['*'], busyResponder)
    Router.registerCommandHandler(['*'], count)
    Router.registerCommandHandler(['*'], cache)
    Router.registerUnsentHandler(cache)
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
        '--single-process'
    ] : []

    const browser = await launch({
        headless: process.env.NODE_ENV == 'production',
        executablePath: process.env.CHROME_BIN,
        ignoreHTTPSErrors: true,
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            ...dockerArgs
        ],
        ignoreDefaultArgs: ['--mute-audio']
    })

    const page = await browser.newPage()
    page.setRequestInterception(true)
    page.on('request', removeImagesAndCss)

    let myUid: string
    try {
        const fbJson = Buffer.from(process.env.COOKIES ?? '', 'base64').toString('utf-8')
        const messengerJson = Buffer.from(process.env.MESSENGER_COOKIES ?? '', 'base64').toString('utf-8')
        const fbCookies = JSON.parse(fbJson)
        const messengerCookies = JSON.parse(messengerJson)
        //@ts-ignore
        myUid = fbCookies.filter(o => o.name == 'c_user')[0].value
        if (typeof myUid !== 'string') throw new Error('Assertion: myUid was not string')
        await page.setCookie(...fbCookies.concat(messengerCookies))
    } catch (_) {
        console.error('Failed to parse cookies')
    }

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

        if (obj.request_id === undefined || obj.request_id !== null)  return
        const payload = JSON.parse(obj.payload)
        
        const data = extractNewMessageInfo(payload, myUid, page)
        if (data) {
            processingQueue.enqueue({ type: 'new_message', data, browser })
        }
    })

    kvStore.on('webhookMessage', (m) => {
        console.log(`[Webhooks] Sending ${m.to} message "${m.message}"`)
        outputQueue.enqueue({
            uid: m.to,
            response: m.message,
            browser
        })
    })

    setInterval(() => page.reload(), 30 * 60 * 1000)
}

function dfs(item: any[], key: string): any[] | null {
    if (typeof item[1] === 'string' && item[1] === key) return item
    for (const it of item) {
        if (Array.isArray(it)) {
            const ret = dfs(it, key)
            if (ret !== null) return ret
        }
    }
    return null
}

function extractNewMessageInfo(payload: any, myUid: string, page: Page): NewMessageData | null {
    const searchResult = dfs(payload.step, 'insertMessage')
    if (!searchResult) return null

    const message = searchResult[2]
    const senderUid = searchResult[12][1]
    const threadId = searchResult[5][1]
    const messageId = searchResult[10]

    if (typeof message !== 'string') return null
    if (typeof senderUid !== 'string') return null
    if (typeof threadId !== 'string') return null
    if (typeof messageId !== 'string') return null

    return {
        message,
        messageId,
        senderUid,
        uid: threadId,
        attachments: makeAttachmentsIterable([], page, threadId, messageId),
        isBot: message.startsWith('\u200E'),
        isSelf: senderUid === myUid,
        isGroupChat: !threadId.startsWith('100')
    } as NewMessageData
}

function makeAttachmentsIterable(attachments: any[], page: Page, uid: string, mid: string): Attachments {
    return {
        length: attachments.length,
        cache: [],
        [Symbol.asyncIterator](): AttachmentIterator {
            const that = this

            return {
                i: 0,
                async next(): Promise<AttachmentIteratorResult> {
                    const done = this.i > that.length - 1
                    
                    if (done) return {
                        value: null,
                        done
                    }

                    if (that.cache[this.i]) return {
                        done,
                        value: that.cache[this.i]
                    }

                    const fbid = attachments[this.i].fbid
                    const large_preview = attachments[this.i].mercury.blob_attachment.large_preview.uri ?? null

                    const value = await page.evaluate(async (uid, mid, fbid) => {
                        const query = new URLSearchParams()
                        query.set('mid', mid)
                        query.set('threadid', uid)
                        query.set('fbid', fbid)

                        const response = await fetch('/messages/attachment_preview/?' + query.toString(), {
                            credentials: 'include'
                        })

                        const text = await response.text()
                        const reg = /href="(https:\/\/scontent.*?)"/
                        const match = reg.exec(text)
                        return match ? match[1].replace(/&amp;/g, '&') : null
                    }, uid, mid, fbid) ?? large_preview

                    that.cache.push(value)

                    this.i++
                    return { done, value }
                }
            }
        }
    }
}


run()

if (process.env.KV_API_KEY) {
    kvStore.serve(parseInt(process.env.PORT ?? '8080'), process.env.KV_API_KEY)
} else {
    console.log('No KV_API_KEY, KV service will not be started')
}

console.log('[Server] Started')

export {}