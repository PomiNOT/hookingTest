import { HandlerRequest, HandlerResponse, NewMessageData } from '../router.js'
import Chat from '../libs/openai.js'

let lasts: Map<string, number> = new Map()

const chat = new Chat({
  role: 'system',
  content: 'You are a genius who can break down and explain difficult topics to anybody. Please answer user questions in under 100 words unless explicitly told otherwise. Your responses should have some spelling mistakes and incorrect grammar. Use emojis but use them sparingly'
})

if (process.env.OPENAI_API_KEY) {
    chat.apiKey = process.env.OPENAI_API_KEY
} else {
    console.log('[OpenAI] You did not specify your OPENAI_API_KEY env variable, requests will fail')
}

export default async function aiResponder({ kv, msgData, body }: HandlerRequest): Promise<HandlerResponse> {
    const { isBot, uid } = msgData as NewMessageData

    if (isBot) return null

    if (lasts.has(uid)) {
        const diff = Date.now() - lasts.get(uid)!
        console.log(diff)
        if (diff < 2000) return null
    }

    lasts.set(uid, Date.now())

    const prompt = `${kv?.store.get('profane') == true ? 'Add lots of profanity to your answer: ' : ''}${body}`
    const response = await chat.getChatResponse(prompt, uid)
    console.log(response)

    return response
}
