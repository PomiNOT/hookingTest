import OpenAI from 'openai'
type ChatRequest = OpenAI.ChatCompletionMessageParam;

export default class Chat {
    private _histories: Map<string, ChatRequest[]> = new Map()
    private _maxHistory: number = 10
    private _maxTokens: number = 700
    private _maxMessageLength: number = 500
    private api: OpenAI | null = null
    private _systemMessage: ChatRequest
    public testing: boolean = false

    constructor(systemMessage: ChatRequest) {
        this._systemMessage = systemMessage
    }

    get systemMessage() {
        return this._systemMessage
    }
    
    set apiKey(apiKey: string) {
        this.api = new OpenAI({ apiKey })
    }

    get maxHistory(): number {
        return this._maxHistory
    }

    set maxHistory(max: number) {
        if (max < 0) throw new RangeError('History length cannot be negative')
        this._maxHistory = max
    }

    get histories(): Map<string, ChatRequest[]> {
        return this._histories
    }

    set maxTokens(max: number) {
        if (max < 0) throw new RangeError('Tokens length cannot be negative')
        this._maxTokens = max
    }

    get maxTokens(): number {
        return this._maxTokens
    }

    set maxMessageLength(max: number) {
        if (max < 0) throw new RangeError('Max message length cannot be negative')
        this._maxMessageLength = max
    }

    get maxMessageLength(): number {
        return this._maxMessageLength
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

        let content = forMessage.slice(0, this.maxMessageLength)
        if (forMessage.length > this.maxMessageLength) {
            content += '...'
        }

        messages!.push({ role: 'user', content })

        const response = await this.api.chat.completions.create({
            model: 'gpt-3.5-turbo',
            max_tokens: this.maxTokens,
            messages: [
                this.systemMessage,
                ...messages!
            ],
            temperature: 0.2,
            top_p: 1,
            frequency_penalty: 0
        })

        const answer = response.choices[0].message
        if (!answer) return null

        messages!.push(answer)
        
        return answer.content ?? null
    }
}
