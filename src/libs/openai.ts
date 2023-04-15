import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'

const SYSTEM_MESSAGE: ChatCompletionRequestMessage = {
    role: 'system',
    content: `
    You are a assistant that only responds in one line.
    You are the assistant of Bim, who is away right now so your job must be answering chat measages for him.
    You can use profanity all you want but only when the other person says bad words.
    You must use a little bit of emojis and don't try to spell things correct all the time, be casual

    Example:
    User: Hello
    Assistant: Hi, how can I help 😀

    Example when user starts to cuss:
    User: Hello
    Asisstant: I'm listening, how can I help you? 👂
    User: Fuck off
    Assistant: Yo motherfucker, calm down bitch

    The conversation begins below
    `
}

export default class Chat {
    private _histories: Map<string, ChatCompletionRequestMessage[]> = new Map()
    private _maxHistory: number = 10
    private api: OpenAIApi | null = null
    public testing: boolean = false
    
    private static _chat: Chat | null = null

    static getInstance() {
        if (!this._chat) {
            this._chat = new Chat()
        }
        return this._chat
    }

    set apiKey(apiKey: string) {
        const conf = new Configuration({ apiKey })
        this.api = new OpenAIApi(conf)
    }

    get maxHistory(): number {
        return this._maxHistory
    }

    set maxHistory(max: number) {
        if (max < 0) throw new RangeError('History length cannot be negative')
        this.maxHistory = max
    }

    get histories(): Map<string, ChatCompletionRequestMessage[]> {
        return this._histories
    }

    public async getChatResponse(forMessage: string, uid: string): Promise<string | null> {
        if (!this.api) throw new Error('Configuration expected, please use setApiKey function to create it')
        
        if (!this.histories.has(uid)) {
            this.histories.set(uid, [])
        }

        const messages = this.histories.get(uid)
        if (messages!.length > this.maxHistory) {
            while (messages!.length > this.maxHistory) {
                messages!.shift()
            }
        }

        messages!.push({ role: 'user', content: forMessage })

        const response = await this.api.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                SYSTEM_MESSAGE,
                ...messages!
            ]
        })

        const answer = response.data.choices[0].message
        if (!answer) return null

        messages!.push(answer)
        
        return answer.content
    }
}