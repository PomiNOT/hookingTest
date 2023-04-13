import puppeteer from 'puppeteer-core'
import Queue from './queue'
import Router, { ProcessingInput, ProcessingOutput } from './router'
import http from 'http'
import { removeImagesAndCss } from './common'
import calc from './handlers/calc'
import define from './handlers/define'
import wordle from './handlers/wordle'


async function run() {
    Router.registerCommandHandler(['define'], define)
    Router.registerCommandHandler(['calc', 'resetcalc'], calc)
    Router.registerCommandHandler(['newwordle', 'g', 'reveal'], wordle)

    const processingQueue = new Queue<ProcessingInput, Promise<ProcessingOutput | null>>({
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

        outputQueue.enqueue(r.data as ProcessingOutput)
    })

    const browser = await puppeteer.launch({
        headless: process.env.NODE_ENV == 'production',
        executablePath: process.env.CHROME_BIN
    })
    const page = await browser.newPage()
    page.setRequestInterception(true)
    page.on('request', removeImagesAndCss)

    let myUid: string | null = null
    try {
        const json = Buffer.from(process.env.COOKIES ?? '', 'base64').toString('utf-8')
        const cookies = JSON.parse(json)
        //@ts-ignore
        myUid = cookies.filter(o => o.name == 'c_user')[0].value ?? null
        await page.setCookie(...cookies)
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

        let type = ''
        const rawJSON = str.slice(str.indexOf('{'))

        let obj
        try {
            obj = JSON.parse(rawJSON)
        } catch (_) {
            return
        }

        //@ts-ignore
        let deltaNewMessages = obj?.deltas?.filter(o => o.class == 'NewMessage')
        if (deltaNewMessages && deltaNewMessages.length > 0) type = 'new_message'

        if (obj.type && obj.type == 'typ') type = 'typing'

        switch (type) {
            case 'new_message':
                for (const msg of deltaNewMessages) {
                    const senderUid = msg.messageMetadata.actorFbId
                    if (msg.body && myUid) {
                        let uid = senderUid == myUid ? msg.messageMetadata.threadKey.otherUserFbId : senderUid
                        const data = { message: msg.body, uid }
                        processingQueue.enqueue({ type, data, browser })
                    }
                }
                break
            case 'typing':
                const data = { uid: obj.sender_fbid.toString(), typing: obj.state == 1 }
                processingQueue.enqueue({ type, data, browser })
                break
        }
    })
}

run()

const server = http.createServer((req, res) => {
    res.writeHead(200)
    res.end(`The time is: ${Date.now()}`)
})

server.listen(process.env.PORT)

console.log('[Server] Started')