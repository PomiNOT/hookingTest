import { Browser } from 'puppeteer-core'
import { removeImagesAndCss } from './common'
import { parse } from 'discord-command-parser'
import KVStore from './libs/kv'

type MessageType = 'new_message' | 'typing'

interface CommonMessageData {
    uid: string
    isSelf: boolean
    isGroupChat: boolean
}

interface NewMessageData extends CommonMessageData {
    message: string
}

interface TypingData extends CommonMessageData {
    typing: boolean
}

type MessageData = NewMessageData | TypingData

export interface ProcessingInput {
    type: MessageType
    data: MessageData
    browser: Browser
}

export interface ProcessingOutput {
    uid: string
    answer: string
    browser: Browser
}

export interface HandlerRequest {
    commandName: string
    args: string[]
    msgData: MessageData,
    kv: KVStore | null,
    browser: Browser
}

interface Handler {
    (request: HandlerRequest): Promise<string | null>
}

export default class Router {
    private static commandHandlers: Map<string, Handler> = new Map<string, Handler>()
    private static typingHandler: Handler | null = null
    private static kvStore: KVStore | null = null

    public static registerCommandHandler(commands: string[], handler: Handler): void {
        for (const cmd of commands) {
            this.commandHandlers.set(cmd, handler)
        }
    }

    public static registerTypingHandler(handler: Handler): void {
        this.typingHandler = handler
    }

    public static registerKVStore(store: KVStore): void {
        this.kvStore = store
    }

    public static async processMessage(input: ProcessingInput): Promise<ProcessingOutput | null> {
        switch (input.type) {
            case 'new_message':
                const data = input.data as NewMessageData

                const parsed = parse({
                    content: data.message,
                    author: { bot: false }
                }, '!')

                if (parsed.success && this.commandHandlers.has(parsed.command)) {
                    console.log(parsed)

                    const answer = await this.commandHandlers.get(parsed.command)!({
                        commandName: parsed.command,
                        args: parsed.arguments,
                        msgData: data,
                        kv: this.kvStore,
                        browser: input.browser
                    })

                    if (!answer) return null

                    return { uid: data.uid, answer, browser: input.browser }
                } else if (this.commandHandlers.has('*')) {
                    const answer = await this.commandHandlers.get('*')!({
                        commandName: '*',
                        args: [data.message],
                        msgData: data,
                        kv: this.kvStore,
                        browser: input.browser
                    })

                    if (!answer) return null

                    return { uid: data.uid, answer, browser: input.browser }
                }

                break
            case 'typing':
                if (this.typingHandler) {
                    const data = input.data as TypingData

                    console.log(data)

                    const answer = await this.typingHandler({
                        commandName: 'typing',
                        args: [],
                        msgData: data,
                        kv: this.kvStore,
                        browser: input.browser
                    })

                    if (!answer) return null

                    return { uid: data.uid, answer, browser: input.browser }
                }
                break
        }

        return null
    }

    public static async writeToMessenger({ browser, uid, answer }: ProcessingOutput): Promise<void> {
        const page = await browser.newPage()
        await page.setRequestInterception(true)
        page.on('request', removeImagesAndCss)
        await page.goto('https://m.facebook.com/messages/read?tid=' + uid)
        await page.type('textarea[name="body"]', answer)
        await page.click('button[name="send"]')
        try {
            await page.waitForNetworkIdle({ timeout: 3000 })
        } finally {
            await page.close()
        }
    }
}