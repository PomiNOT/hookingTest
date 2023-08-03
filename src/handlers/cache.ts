import { FilePath, HandlerRequest, HandlerResponse, NewMessageData, UnsentData } from '../router'
import { db, storage } from '../libs/firebase'
import { FieldValue } from 'firebase-admin/firestore'
import { tmpdir } from 'os'
import { mkdtemp } from 'fs/promises'
import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'

interface Message {
    sender: string,
    message: string,
    messageId: string,
    timestamp: FieldValue,
    attachments: string[]
}
interface InMemoryMessage extends Message {
    cachedPaths: Promise<string>[],
    locked: boolean
}

const store: Map<string, InMemoryMessage> = new Map()
const MAX_LENGTH = 20

export default async function cache({ args, msgData, commandName }: HandlerRequest): Promise<HandlerResponse> {
    const { uid, isSelf } = msgData

    if (commandName === 'unsent') {
        console.log(msgData)
        const { isGroupChat, messageId } = msgData as UnsentData
        if (isGroupChat) return null
        if (store.has(messageId)) {
            const msg = store.get(messageId)!
            const { cachedPaths, message } = msg
            msg.locked = true

            try {
                const filePaths: FilePath[] = (await Promise.all(cachedPaths)).map((path) => ({
                    path,
                    deleteAfterUse: true
                }))

                if (filePaths.length > 0) {
                    const response: HandlerResponse = {
                        answer: 'Deleted content\n' + message,
                        recipientUid: uid,
                        filePaths
                    }

                    return response
                } else {
                    return 'Deleted content\n' + message
                }
            } finally {
                msg.locked = false
                store.delete(messageId)
            }
        }
    } else if (commandName === '*' && !isSelf) {
        const { senderUid, attachments, messageId } = msgData as NewMessageData

        const message: Message = {
            sender: senderUid,
            message: args[0],
            messageId,
            timestamp: FieldValue.serverTimestamp(),
            attachments: [] as string[]
        }

        const cachedPaths: Promise<string>[] = []
        const bucket = storage.bucket()

        let tmpDir = ''

        if (attachments.length > 0) {
            const tmpDirPrefix = join(tmpdir(), 'hookingTest-')
            tmpDir = await mkdtemp(tmpDirPrefix)
        }

        for await (const attachment of attachments) {
            if (attachment !== null) {
                const response = await fetch(attachment)

                if (response.ok && response.body !== null) {
                  const filename = new URL(attachment).pathname.split('/').pop()
                  const path = `rooms/${uid}/messages/${messageId}/${filename}`
                  const file = bucket.file(path)

                  const writeStream = file.createWriteStream({
                    resumable: false
                  })

                  const filePath = join(tmpDir, filename ?? 'blob')
                  let diskWriteStream = cachedPaths.length < 3 ? createWriteStream(filePath) : undefined
                  const reader = response.body.getReader()

                  const promise = new Promise<string>(async (resolve, _) => {
                    let result: ReadableStreamReadResult<Uint8Array>
                    do {
                        result = await reader.read()
                        if (result.value !== undefined) {
                            writeStream.write(result.value)
                            if (diskWriteStream) diskWriteStream.write(result.value)
                        } 
                    } while (!result.done)

                    writeStream.end()
                    if (diskWriteStream) diskWriteStream.end()

                    resolve(filePath)
                  })

                  message.attachments.push(path)
                  cachedPaths.push(promise)
                }
            }
        }
        
        const outstanding = store.size - MAX_LENGTH
        const keysIter = store.keys()
        let key = keysIter.next()
        for (let i = 0; i < outstanding && !key.done; i++) {
            const message = store.get(key.value)!

            if (message.locked) continue
            else {
                store.delete(key.value)
                await Promise.all(
                    message.cachedPaths.map(path => path.then(unlink))
                )
            }
        }

        store.set(messageId, {
            ...message,
            cachedPaths,
            locked: false
        })

        await db.doc(`/rooms/${uid}/messages/${messageId}`).set(message)
    }
    
    return null
}
