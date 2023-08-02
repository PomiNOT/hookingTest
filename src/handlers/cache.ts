import { HandlerRequest } from '../router'
import { DateTime } from 'luxon'

const store: Map<string, string[]> = new Map()
const MAX_LENGTH = 30

export default async function cache({ args, msgData, commandName }: HandlerRequest): Promise<string | null> {
    const { uid } = msgData
    if (commandName === '*' && !msgData.isSelf) {
        if (!store.has(uid)) {
            store.set(uid, [])
        }

        const line = store.get(uid)!
        while (line.length > MAX_LENGTH) line.shift()
        const now = DateTime.now().setZone('Asia/Ho_Chi_Minh')

        line.push(now.toFormat('HH:mm:ss') + ': ' + args[0])
        return null
    } else if (commandName === 'what' && store.has(uid)) return store.get(uid)!.join('\n')
    
    return null
}
