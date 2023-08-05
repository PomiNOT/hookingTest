import { HandlerRequest, HandlerResponse } from '../router.js'
import { Message } from './cache.js'
import { db } from '../libs/firebase.js'
import { DateTime } from 'luxon'
import { Timestamp } from 'firebase-admin/firestore'
import Chat from '../libs/openai.js'

const api = new Chat()

if (!process.env.OPENAI_API_KEY) {
    console.log('[Bing] OPENAI_API_KEY invalid, this service will not work')
} else {
    api.apiKey = process.env.OPENAI_API_KEY!
    api.maxHistory = 0
}

export default async function summarize({ msgData }: HandlerRequest): Promise<HandlerResponse> {
    const roomRef = db.collection('rooms').doc(msgData.uid).collection('messages')
    const room = await roomRef.limitToLast(20).orderBy('timestamp', 'asc').get()

    if (!room.empty) {
        const messages: Message[] = room.docs.map(snap => snap.data() as Message)
        const textMessages = messages.filter(({ message }) => !!message).map(({ message, timestamp, sender }) => {
            const date = DateTime.fromMillis((timestamp as Timestamp).toMillis())
            return `At ${date.toFormat('hh:mm:ss')} ${sender} said: ${message}`
        })

        if (textMessages.length < 1) return null

        const prompt = `Summarize the topic of this conversation:\n${textMessages.join('\n')}`
        console.log(prompt)
        const answer = await api.getChatResponse(prompt, msgData.uid)
        return answer
    }

    return null
}
