import { HandlerRequest, HandlerResponse, NewMessageData } from '../router.js'
import { db, storage } from '../libs/firebase.js'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export interface Message {
    sender: string,
    message: string,
    messageId: string,
    timestamp: FieldValue | Timestamp,
    attachments: string[]
}

export default async function cache({ args, msgData, commandName }: HandlerRequest): Promise<HandlerResponse> {
    const { uid, senderUid, attachments, messageId, isBot } = msgData as NewMessageData
    if (isBot) return null

    const message: Message = {
        sender: senderUid,
        message: args[0],
        messageId,
        timestamp: FieldValue.serverTimestamp(),
        attachments: [] as string[]
    }

    const bucket = storage.bucket()

    for (const attachment of attachments) {
        if (attachment !== null) {
            const response = await fetch(attachment)

            if (response.ok && response.body !== null) {
                const filename = new URL(attachment).pathname.split('/').pop()
                const path = `rooms/${uid}/messages/${messageId}/${filename}`
                const file = bucket.file(path)

                const writeStream = file.createWriteStream({
                    resumable: false
                })

                const reader = response.body.getReader()

                let result: ReadableStreamReadResult<Uint8Array>
                do {
                    result = await reader.read()
                    if (result.value !== undefined) {
                        writeStream.write(result.value)
                    } 
                } while (!result.done)

                writeStream.end()

                message.attachments.push(path)
            }
        }
    }
    
    await db.doc(`/rooms/${uid}/messages/${messageId}`).set(message)

    return null
}
