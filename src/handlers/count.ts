import { credential } from 'firebase-admin'
import { initializeApp, ServiceAccount } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HandlerRequest, HandlerResponse } from '../router'

try {
    const cred = Buffer.from(process.env.FIREBASE ?? '', 'base64').toString('utf-8')
    const serviceAccountJSON = JSON.parse(cred)
    const serviceAccount: ServiceAccount = {
        projectId: serviceAccountJSON['project_id'],
        privateKey: serviceAccountJSON['private_key'],
        clientEmail: serviceAccountJSON['client_email']
    }

    initializeApp({credential: credential.cert(serviceAccount) })
} catch(e) {
    console.log(e)
    console.log('[FIREBASE] Service account credentials required!')    
}

const db = getFirestore()

export default async function catchAll({ args, msgData }: HandlerRequest): Promise<HandlerResponse> {
    const words = args[0].split(' ');
    const count = words.filter(word => {
        const noAccentWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        return ['ao', 'troll', 'die', 'chet'].includes(noAccentWord)
    }).length

    if (count > 0) {
        await db.doc('/counters/total').update({
            count: FieldValue.increment(count)
        })
        console.log(`Added ${count} to count`)

        if (!msgData.isGroupChat) {
            return '+' + count
        }
    }

    return null
}