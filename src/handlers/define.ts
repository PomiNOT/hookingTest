import { HandlerRequest, HandlerResponse } from '../router.js'

export default async function define({ args }: HandlerRequest): Promise<HandlerResponse> {
    const word = args[0]
    let answer = ''
    if (word) {
        const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + word)
        const json: any = await response.json()
        if (json.message) {
            answer = json.message
        } else {
            for (const meaning of json[0].meanings) {
                answer += `${word} (${meaning.partOfSpeech}): ${meaning.definitions[0].definition}\n`
            }
        }
        return answer
    }
    return null
}