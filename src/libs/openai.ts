import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'

const SYSTEM_MESSAGE: ChatCompletionRequestMessage = {
    role: 'system',
    content: 'You are a text summarist. Write a short summary in Vietnamese for a chat given by the user in short essay format.'
}

export default class Chat {
    private _histories: Map<string, ChatCompletionRequestMessage[]> = new Map()
    private _maxHistory: number = 10
    private _maxTokens: number = 700
    private _maxMessageLength: number = 500
    private api: OpenAIApi | null = null
    public testing: boolean = false
    
    set apiKey(apiKey: string) {
        const conf = new Configuration({ apiKey })
        this.api = new OpenAIApi(conf)
    }

    get maxHistory(): number {
        return this._maxHistory
    }

    set maxHistory(max: number) {
        if (max < 0) throw new RangeError('History length cannot be negative')
        this._maxHistory = max
    }

    get histories(): Map<string, ChatCompletionRequestMessage[]> {
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

        const response = await this.api.createChatCompletion({
            model: 'gpt-3.5-turbo',
            max_tokens: this.maxTokens,
            messages: [
                SYSTEM_MESSAGE,
                ...messages!
            ],
            temperature: 0.9,
            top_p: 1,
            frequency_penalty: 1
        })

        const answer = response.data.choices[0].message
        if (!answer) return null

        messages!.push(answer)
        
        return answer.content ?? null
    }
}
