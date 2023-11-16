import { HandlerRequest, HandlerResponse } from '../router.js'
import { db } from '../libs/firebase.js'
import * as passwords from 'secure-random-password'

export default async function what({ msgData }: HandlerRequest): Promise<HandlerResponse> {
    const { uid } = msgData

    const pin = passwords.randomPassword({ length: 6, characters: '0123456789' })

    const doc = await db.collection('/grants').add({
        attempts: 0,
        pin,
        roomId: uid,
        validUntil: new Date(Date.now() + 1_800_000) //30 minutes
    })

    return `Visit ${process.env.VIEWER_BASE_URL}/${encodeURIComponent(doc.id)} and enter this PIN ${pin}`
}