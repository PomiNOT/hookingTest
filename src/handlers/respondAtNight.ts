import { HandlerRequest } from '../router'
import { DateTime } from 'luxon'
import Chat from '../libs/openai'
import { config } from 'dotenv'

config()

let lasts: Map<string, number> = new Map()

const chat = Chat.getInstance()

if (process.env.OPENAI_API_KEY) {
    chat.apiKey = process.env.OPENAI_API_KEY
} else {
    console.log('[OpenAI] You did not specify your OPENAI_API_KEY env variable, requests will fail')
}

export default async function respondAtNight({ commandName, args, kv, msgData }: HandlerRequest): Promise<string | null> {
    const now = DateTime.now().setZone('Asia/Ho_Chi_Minh')
    const isNighttime = now.hour >= 22 || now.hour < 6
    if (!msgData.isSelf && (isNighttime || kv?.store.get('busy') as boolean == true)) {
        if (commandName == '*') {
            if (lasts.has(msgData.uid)) {
                const diff = Date.now() - lasts.get(msgData.uid)!
                console.log(diff)
                if (diff < 2000) return null
            }

            lasts.set(msgData.uid, Date.now())

            const prompt = `Answer concisely ${kv?.store.get('profane') == true ? ' and add lots of profanity' : ''}: ${args[0]}`
            const response = await chat.getChatResponse(prompt, msgData.uid)
            console.log(response)
            return response
        }
    }

    return null
}
