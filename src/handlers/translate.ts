import { HandlerRequest, HandlerResponse, NewMessageData } from '../router'

const translationEnabled: { [key: string]: boolean } = {};
let language = 'en'

const ERROR_MESSAGE = '[Translation] No TRANSLATE_API_KEY, please specify one'

if (!process.env.TRANSLATE_API_KEY) {
    console.log(ERROR_MESSAGE)
}

async function translateAPI(text: string, language = 'en'): Promise<string | null> {
    if (process.env.TRANSLATE_API_KEY) {
        const url = new URL('https://translation.googleapis.com/language/translate/v2')
        url.searchParams.append('q', text)
        url.searchParams.append('target', language)
        url.searchParams.append('format', 'text')
        url.searchParams.append('model', 'nmt')
        url.searchParams.append('key', process.env.TRANSLATE_API_KEY)

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`${response.status} - ${response.statusText}`)
        }

        const json = await response.json()
        const translations: { translatedText: string }[] | undefined = json?.data?.translations
        if (!translations) return null

        return translations[0]?.translatedText
    } else {
        return null
    }
}

export default async function translate({ args, body, commandName, msgData }: HandlerRequest): Promise<HandlerResponse> {
    const { isBot, isGroupChat, senderUid } = msgData as NewMessageData;
    if (isBot || isGroupChat) return null;

    if (commandName === 'translate_me') {
        if (translationEnabled[senderUid]) {
            delete translationEnabled[senderUid]
            return `You are no longer in the list of participants`
        } else {
            translationEnabled[senderUid] = true
            return `You are added to the list of participants`
        }
    } else if (commandName === 'set_language') {
        if (args[0]?.length === 2) {
            language = args[0]
            return `Set language to ${language}`
        }
    } else if (commandName === '*' && translationEnabled[senderUid]) {
        const text = await translateAPI(body, language)
        console.log(text)
        return text
    }

    return null
}