import { translate as translateAPI } from '@vitalets/google-translate-api'
import { HandlerRequest, HandlerResponse, NewMessageData } from '../router'

let translationOn = false
let language = 'en'

export default async function translate({ args, body, commandName, msgData }: HandlerRequest): Promise<HandlerResponse> {
    const { isSelf, isBot } = msgData as NewMessageData;
    if (isBot) return null;

    if (commandName === 'toggle_translation') {
        if (isSelf) {
            translationOn = !translationOn
            return `Translation is ${translationOn ? 'enabled' : 'disabled'}`
        } else {
            return "You can't do that"
        }
    } else if (commandName === 'set_language') {
        if (isSelf && args[0]?.length === 2) {
            language = args[0]
            return `Set language to ${language}`
        }
    } else if (commandName === '*' && translationOn && msgData.isSelf) {
        const { text } = await translateAPI(body, { to: 'en' })
        return text
    }

    return null
}