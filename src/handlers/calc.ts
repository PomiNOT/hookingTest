import { HandlerRequest } from '../router'
import { Parser, parser } from 'mathjs'

const scopes = new Map<string, Parser>()

export default async function calc({ args, commandName, msgData }: HandlerRequest): Promise<string | null> {
    if(commandName == 'calc') {
        if (!scopes.has(msgData.uid)) {
            scopes.set(msgData.uid, parser())
        }
        const expr = args.join(' ')
        const answer = scopes.get(msgData.uid)?.evaluate(expr)
        if (typeof answer != 'function') {
            return answer.toString()
        } else {
            return '[Math] Defined function'
        }
    } else if (commandName == 'resetcalc') {
        if (scopes.has(msgData.uid)) {
            scopes.get(msgData.uid)?.clear()
        }
        return '[Math] Reset done'
    }
    
    return null
}