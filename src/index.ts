import { config } from 'dotenv'
config()

import { launch, Page } from 'puppeteer-core'
import Router, { AttachmentIterator, AttachmentIteratorResult, Attachments, MessageData, NewMessageData, ProcessingInput, ProcessingOutput, TypingData, UnsentData } from './router'
import { removeImagesAndCss } from './common'
import Queue from './libs/queue'
import KVStore from './libs/kv'

import calc from './handlers/calc'
import define from './handlers/define'
import wordle from './handlers/wordle'
import busyResponder from './handlers/busyResponder'
import count from './handlers/count'
import callme from './handlers/callme'
import runCommand from './handlers/run'
import cache from './handlers/cache'

const kvStore = new KVStore()
async function run() {
    Router.registerCommandHandler(['define'], define)
    Router.registerCommandHandler(['calc', 'resetcalc'], calc)
    Router.registerCommandHandler(['newwordle', 'g', 'reveal', 'tries'], wordle)
    Router.registerCommandHandler(['callme'], callme)
    Router.registerCommandHandler(['run'], runCommand)
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


    await page.goto('https://m.facebook.com/messages')

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

        let type = ''
        const deltas = obj?.deltas
        if (deltas && deltas.length > 0) type = 'deltas'
        if (obj.type && obj.type == 'typ') type = 'typing'
        
        switch (type) {
            case 'deltas':
                for (const delta of deltas) {
                    switch (delta.class) {
                        case 'NewMessage':
                            const data = handleNewMessage(delta, myUid, page)
                            processingQueue.enqueue({ type: 'new_message', data, browser })
                            break
                        case 'ClientPayload':
                            const payload = Buffer.from(delta.payload).toString()
                            const json = JSON.parse(payload)
                            const recallData = json.deltas[0].deltaRecallMessageData
                            if (recallData) {
                                const senderUid = recallData.senderID
                                if (senderUid === myUid) break

                                const threadId = recallData.threadKey.threadFbId ?? recallData.threadKey.otherUserFbId

                                const data: UnsentData = {
                                    uid: threadId,
                                    isGroupChat: threadId !== senderUid,
                                    isSelf: false,
                                    messageId: recallData.messageID,
                                    senderUid
                                }

                                processingQueue.enqueue({ type: 'unsent', browser, data })
                            }
                            break
                    }
                }
                break
            case 'typing':
                const uid = obj.sender_fbid.toString()
                const isSelf = uid == myUid
                const data = { uid, isSelf, isGroupChat: false, typing: obj.state == 1 } as TypingData
                processingQueue.enqueue({ type, data, browser })
                break
        }
    })

    setInterval(() => page.reload(), 30 * 60 * 1000)
}

function handleNewMessage(delta: any, myUid: string, page: Page): MessageData {
    const senderUid = delta.messageMetadata.actorFbId
    const isSelf = senderUid === myUid
    const groupChatId = delta.messageMetadata.cid.conversationFbid
    let uid = !!groupChatId ? groupChatId : isSelf ? delta.messageMetadata.threadKey.otherUserFbId : senderUid

    const rawAttachments = delta.attachments ?? []
    const messageId = delta.messageMetadata.messageId
    const attachments = makeAttachmentsIterable(rawAttachments, page, uid, messageId)

    const data = {
        message: delta.body ?? '',
        messageId, 
        senderUid,
        uid,
        isSelf,
        isGroupChat: !!groupChatId,
        attachments
    } as NewMessageData
    
    return data
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
