import { HandlerRequest } from '../router'
import { DateTime } from 'luxon'
import Chat from '../libs/openai'
import { credential } from 'firebase-admin'
import { initializeApp, ServiceAccount } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

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

let lasts: Map<string, number> = new Map()

const chat = new Chat()

if (process.env.OPENAI_API_KEY) {
    chat.apiKey = process.env.OPENAI_API_KEY
} else {
    console.log('[OpenAI] You did not specify your OPENAI_API_KEY env variable, requests will fail')
}

async function updateCount(body: string) {
    const words = body.split(' ');
    const count = words.filter(word => {
        const noAccentWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        return ['ao', 'troll', 'die', 'chet'].includes(noAccentWord)
    }).length

    if (count > 0) {
        await db.doc('/counters/total').update({
            count: FieldValue.increment(count)
        })
        console.log(`Added ${count} to count`)
    }
}

export default async function catchAll({ args, kv, msgData }: HandlerRequest): Promise<string | null> {
    updateCount(args[0])

    const now = DateTime.now().setZone('Asia/Ho_Chi_Minh')
    const isNighttime = now.hour >= 22 || now.hour < 6

    const busy = kv?.store.get('busy') as boolean
    const startsWithAI = args[0].startsWith('!ai')
    if (startsWithAI) {
      args[0] = args[0].slice(3).trimStart()
    }

    if (!msgData.isGroupChat && ((!msgData.isSelf && (isNighttime || busy)) || startsWithAI)) {
      if (lasts.has(msgData.uid)) {
          const diff = Date.now() - lasts.get(msgData.uid)!
          console.log(diff)
          if (diff < 2000) return null
      }

      lasts.set(msgData.uid, Date.now())

      const prompt = `${kv?.store.get('profane') == true ? 'Add lots of profanity to your answer: ' : ''}${args[0]}`
      const response = await chat.getChatResponse(prompt, msgData.uid)
      console.log(response)
      return response
    }

    return null
}
