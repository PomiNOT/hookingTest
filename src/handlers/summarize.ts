import { HandlerRequest, HandlerResponse } from '../router.js'
import { Message } from './cache.js'
import { db } from '../libs/firebase.js'
import { DateTime } from 'luxon'
import { Timestamp } from 'firebase-admin/firestore'
import OpenAI from 'openai'
import Chat from '../libs/openai.js'

type ChatRequest = OpenAI.ChatCompletionMessageParam;

const SYSTEM_MESSAGE: ChatRequest = {
    role: 'system',
    content: 'You are a text summarist. Write a short summary in for a chat given by the user in short essay format.'
}

const api = new Chat(SYSTEM_MESSAGE)

if (!process.env.OPENAI_API_KEY) {
    console.log('[OpenAI] OPENAI_API_KEY invalid, this service will not work')
} else {
    api.apiKey = process.env.OPENAI_API_KEY!
    api.maxHistory = 0
}

function numberToLetter(num: number): string {
    let result = '';
    const base = 'A'.charCodeAt(0);
  
    while (num >= 0) {
      result = String.fromCharCode(num % 26 + base) + result;
      num = Math.floor(num / 26) - 1;
    }
  
    return result;
}

export default async function summarize({ msgData }: HandlerRequest): Promise<HandlerResponse> {
    const roomRef = db.collection('rooms').doc(msgData.uid).collection('messages')
    const room = await roomRef.limitToLast(20).orderBy('timestamp', 'asc').get()

    if (!room.empty) {
        const messages: Message[] = room.docs.map(snap => snap.data() as Message)
        const namesAssoc: { [key: string]: string } = {}
        let count = 0
        
        const filtedMessages = messages.filter(({ message }) => !!message)

        for (const { sender } of filtedMessages) {
            if (!namesAssoc[sender]) {
                namesAssoc[sender] = numberToLetter(count)
                count++
            }
        }

        const textMessages = filtedMessages.map(({ message, timestamp, sender }) => {
            const date = DateTime
                            .fromMillis((timestamp as Timestamp).toMillis())
                            .setZone('Asia/Ho_Chi_Minh')
            return `At ${date.toFormat('DD HH:mm:ss')} ${namesAssoc[sender]} said: ${message}`
        })


        if (textMessages.length < 1) return null

        const prompt = `Write a detailed summary for this chat:\n${textMessages.join('\n')}`
        console.log(prompt)
        const answer = await api.getChatResponse(prompt, msgData.uid)
        return answer
    }

    return null
}
