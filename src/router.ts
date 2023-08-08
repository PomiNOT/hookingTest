import { Browser, Page } from 'puppeteer-core'
import { removeImagesAndCss } from './common.js'
import { parse } from 'discord-command-parser'
import KVStore from './libs/kv.js'
import { unlink } from 'fs/promises'

type MessageType = 'new_message' | 'typing' | 'unsent'

interface CommonMessageData {
    uid: string
    isSelf: boolean
    isGroupChat: boolean
}

export interface NewMessageData extends CommonMessageData {
    message: string
    messageId: string
    senderUid: string
    isBot: boolean
    attachments: string[]
}

export interface TypingData extends CommonMessageData {
    typing: boolean
}

export interface UnsentData extends CommonMessageData {
    messageId: string,
    senderUid: string
}

export type MessageData = NewMessageData | TypingData | UnsentData

export interface ProcessingInput {
    type: MessageType
    data: MessageData
    browser: Browser
}

export interface FilePath {
    path: string,
    deleteAfterUse: boolean
}

export interface ProcessingOutput {
    uid: string
    response: string | {
        answer: string,
        filePaths: FilePath[]
    }
    browser: Browser
}

export interface HandlerRequest {
    commandName: string
    args: string[]
    body: string
    msgData: MessageData
    kv: KVStore | null
    browser: Browser
}

export type HandlerResponse = string | {
    answer: string,
    filePaths: FilePath[],
    recipientUid: string
} | null

interface Handler {
    (request: HandlerRequest): Promise<HandlerResponse>
}

export default class Router {
    private static commandHandlers: Map<string, Handler[]> = new Map<string, Handler[]>()
    private static typingHandler: Handler | null = null
    private static unsentHandler: Handler | null = null
    private static kvStore: KVStore | null = null
    private static pages: Map<string, { lastUsed: number, page: Page }> = new Map()
    private static _maxPages: number = 5
    private static unusedTimeout: number = 120
    private static garbageCollector: NodeJS.Timer

    static {
        this.garbageCollector = setInterval(this.closeUnusedPages.bind(this), (this.unusedTimeout / 3) * 1000);
    }

    static get maxPages(): number {
        return this._maxPages
    }

    static set maxPages(max: number) {
        if (max < 1) throw new Error('Number of pages must be at least 1')
        this._maxPages = max
    }

    public static registerCommandHandler(commands: string[], handler: Handler): void {
        for (const cmd of commands) {
            if (!this.commandHandlers.has(cmd)) {
                this.commandHandlers.set(cmd, []);
            }

            this.commandHandlers.get(cmd)!.push(handler);
        }
    }

    public static registerTypingHandler(handler: Handler): void {
        this.typingHandler = handler
    }

    public static registerUnsentHandler(handler: Handler): void {
        this.unsentHandler = handler
    }

    public static registerKVStore(store: KVStore): void {
        this.kvStore = store
    }

    private static async closeUnusedPages() {
        const tasks = Array.from(this.pages.entries())
                                        .filter(([, page]) => page.lastUsed + this.unusedTimeout * 1000 <= Date.now())
                                        .map(([uid, page]) => {
                                            this.pages.delete(uid);
                                            return page.page.close();
                                        })
        await tasks
    }

    private static async getAnswers(handler: string, request: HandlerRequest): Promise<HandlerResponse[]> {
        const handlers = this.commandHandlers.get(handler)!

        const promises = handlers.map(handler => handler(request))

        const results = await Promise.allSettled(promises)
        const outputs: HandlerResponse[] = []

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value !== null) {
                outputs.push(result.value)
            } else if (result.status === 'rejected') {
                console.error(result.reason)
            }
        }

        return outputs
    }

    public static async processMessage(input: ProcessingInput): Promise<ProcessingOutput[]> {
        let answers: HandlerResponse[] = []

        switch (input.type) {
            case 'new_message':
                const data = input.data as NewMessageData

                const parsed = parse({
                    content: data.message,
                    author: { bot: false }
                }, '!')

                if (parsed.success && this.commandHandlers.has(parsed.command)) {
                    const request = {
                        commandName: parsed.command,
                        args: parsed.arguments,
                        body: parsed.reader.body,
                        msgData: data,
                        kv: this.kvStore,
                        browser: input.browser
                    }
                    
                    answers = await this.getAnswers(parsed.command, request)
                } else if (this.commandHandlers.has('*')) {
                    const request = {
                        commandName: '*',
                        args: [data.message],
                        body: data.message,
                        msgData: data,
                        kv: this.kvStore,
                        browser: input.browser
                    }

                    answers = await this.getAnswers('*', request)
                }

                break
            case 'typing':
                if (this.typingHandler) {
                    const data = input.data as TypingData

                    const answer = await this.typingHandler({
                        commandName: 'typing',
                        args: [],
                        msgData: data,
                        body: '',
                        kv: this.kvStore,
                        browser: input.browser
                    })

                    if (answer) answers.push(answer)
                }
                break
            case 'unsent':
                if (this.unsentHandler) {
                    const data = input.data as UnsentData

                    const answer = await this.unsentHandler({
                        commandName: 'unsent',
                        args: [],
                        msgData: data,
                        body: '',
                        kv: this.kvStore,
                        browser: input.browser
                    })

                    if (answer) answers.push(answer)
                }
        }
        
        //since we have filtered out the nulls in getAnswers, we can use force non-null here
        const output: ProcessingOutput[] = answers.map(response => {
            const isString = typeof response === 'string'
            const value = {
                uid: isString ? input.data.uid : response!.recipientUid,
                response: isString ? response : {
                    answer: response!.answer,
                    filePaths: response!.filePaths
                },
                browser: input.browser
            }
            return value
        })

        return output
    }

    public static async writeToMessenger({ browser, uid, response }: ProcessingOutput): Promise<void> {
        let page: Page

        if (!this.pages.has(uid)) {
            if (this.pages.size < this.maxPages) {
                page = await browser.newPage()
                await page.setRequestInterception(true)
                page.on('request', removeImagesAndCss)
                await page.goto('https://mbasic.facebook.com/messages/read?fbid=' + uid)
            } else {
                const leastRecentlyUsedPage = Array.from(this.pages.entries())
                                                .sort(([,a], [,b]) => a.lastUsed - b.lastUsed)[0]
                page = leastRecentlyUsedPage[1].page
                this.pages.delete(leastRecentlyUsedPage[0])
                await page.goto('https://mbasic.facebook.com/messages/read?fbid=' + uid)
            }
        } else {
            page = this.pages.get(uid)!.page
        }

        this.pages.set(uid, {
            page,
            lastUsed: Date.now()
        })
        
        await page.bringToFront()
        if (typeof response === 'string') {
            await page.waitForSelector('textarea#composerInput')
            await page.type('textarea#composerInput', '\u200E' + response)
            await page.click('input[name="send"]', { delay: 1000 })
        } else {
            await page.waitForSelector('textarea#composerInput')
            await page.type('textarea#composerInput', '\u200E' + response)
            await page.click('input[name="send"]', { delay: 1000 })

            /* this no longer works
            for (const file of response.filePaths) {
                await page.waitForSelector('input[name="photo"]')
                const input = await page.$(`input[name="photo"]`)
                await input?.uploadFile(file.path)
            }

            await page.waitForSelector('button[name="send"]:not([disabled])')
            await page.click('button[name="send"]', { delay: 2000 })
            */

            for (const file of response.filePaths) {
                if (file.deleteAfterUse) {
                    try {
                        unlink(file.path)
                    } catch(e) {
                        console.log(e)
                    }
                }
            }
        }
    }
}