import { HandlerRequest, HandlerResponse, NewMessageData } from '../router'
import { DateTime } from 'luxon'

const store: Map<string, string[]> = new Map()
const MAX_LENGTH = 30

export default async function cache({ args, msgData, commandName }: HandlerRequest): Promise<HandlerResponse> {
    const { uid, isSelf, senderUid, attachments } = msgData as NewMessageData
    if (commandName === '*' && !isSelf) {
        if (!store.has(uid)) {
            store.set(uid, [])
        }

        const line = store.get(uid)!
        while (line.length > MAX_LENGTH) line.shift()
        const now = DateTime.now().setZone('Asia/Ho_Chi_Minh')

        let date = now.toFormat('HH:mm:ss') + ': '

        if (args[0]) {
            line.push(date + args[0])
        }

        for await (const attachment of attachments) {
            if (attachment) {
                line.push(date + attachment)
            }
        }

        return null
    } else if (commandName === 'what' && store.has(uid)) {
        return { answer: store.get(uid)!.join('\n'), recipientUid: senderUid }
    }
    
    return null
}
