import puppeteer, { Browser } from 'puppeteer-core'
import Game from './wordle'
import Queue from './queue'
import http from 'http'

type MessageType = 'new_message' | 'typing'

interface NewMessageData {
    uid: string
    message: string
}

interface TypingData {
    uid: string,
    typing: boolean
}

type MessageData = NewMessageData | TypingData

interface ProcessingInput {
    type: MessageType,
    data: MessageData
    browser: Browser
}

interface ProcessingOutput {
    uid: string,
    answer: string,
    browser: Browser
}

const games = new Map<string, Game>()

async function processMessage(input: ProcessingInput): Promise<ProcessingOutput | null> {
    console.log(input.data)

    switch (input.type) {
        case 'new_message':
            const { message, uid } = (input.data as NewMessageData)
            if (message.startsWith('/define ')) {
                const word = message.split(' ')[1]
                let answer = ''
                if (word) {
                    const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + word)
                    const json: any = await response.json()
                    if (json.message) {
                        answer = json.message
                    } else {
                        for (const meaning of json[0].meanings) {
                            answer += `${word} (${meaning.partOfSpeech}): ${meaning.definitions[0].definition}\n`
                        }
                    }
                } else {
                    answer = 'You did not specify a word'
                }
                return { uid, answer, browser: input.browser }
            } else if (message.startsWith('/newwordle')) {
                const game = new Game()
                games.set(uid, game)
                return { uid, answer: '[Game] Created a new game', browser: input.browser }
            } else if (message.startsWith('/g ')) {
                const guess = message.split(' ')[1]
                if (games.has(uid)) {
                    const game = games.get(uid)
                    const { message } = game!.check(guess.toLowerCase())
                    return { uid, answer: message, browser: input.browser }
                }
            } else if (message.startsWith('/reveal')) {
                if (games.has(uid)) {
                    const game = games.get(uid)
                    return { uid, answer: `[Game] It was ${game!.randomWord.toUpperCase()}`, browser: input.browser }
                }
            }
            break
    }

    return null
}

async function writeToMessenger({ uid, answer, browser }: ProcessingOutput): Promise<void> {
    const page = await browser.newPage()
    await page.goto('https://m.facebook.com/messages/read?tid=' + uid)
    await page.type('textarea[name="body"]', answer)
    await page.click('button[name="send"]')
    await page.waitForNetworkIdle({ timeout: 3000 })
    await page.close()
}

async function run() {
    const processingQueue = new Queue<ProcessingInput, Promise<ProcessingOutput | null>>({
        processFunc: processMessage,
        sequential: false
    })
    const outputQueue = new Queue<ProcessingOutput, Promise<void>>({
        processFunc: writeToMessenger,
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

    let myUid: string | null = null
    try {
        const json = process.env.COOKIES ?? '[]'
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

server.listen(8080)