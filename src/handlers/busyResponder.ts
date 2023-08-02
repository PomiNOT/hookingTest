import { HandlerRequest } from '../router'
//import { DateTime } from 'luxon'
//import Chat from '../libs/openai'

//let lasts: Map<string, number> = new Map()

//const chat = new Chat()

/*
if (process.env.OPENAI_API_KEY) {
    chat.apiKey = process.env.OPENAI_API_KEY
} else {
    console.log('[OpenAI] You did not specify your OPENAI_API_KEY env variable, requests will fail')
}
*/


export default async function catchAll({ args, kv, msgData }: HandlerRequest): Promise<string | null> {
    //const now = DateTime.now().setZone('Asia/Ho_Chi_Minh')
    //const isNighttime = now.hour >= 0 && now.hour < 6

    const busy = kv?.store.get('busy') as boolean
    const startsWithAI = args[0].startsWith('!ai')
    if (startsWithAI) {
      //args[0] = args[0].slice(3).trimStart()
      return 'OpenAI has blocked me from using their API, this feature has been disabled'
    }

    if (!msgData.isGroupChat && !msgData.isSelf && busy) {
      /*
      if (lasts.has(msgData.uid)) {
          const diff = Date.now() - lasts.get(msgData.uid)!
          console.log(diff)
          if (diff < 2000) return null
      }
      */

      //lasts.set(msgData.uid, Date.now())

      /*
      const prompt = `${kv?.store.get('profane') == true ? 'Add lots of profanity to your answer: ' : ''}${args[0]}`
      const response = await chat.getChatResponse(prompt, msgData.uid)
      console.log(response)
      return response
      */
      return 'He is busy right now'
    }

    return null
}
