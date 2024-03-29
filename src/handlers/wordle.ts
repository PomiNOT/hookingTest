import { HandlerRequest, HandlerResponse } from '../router.js'
import Game from '../libs/wordle.js'

const games = new Map<string, Game>()

export default async function wordle({ args, commandName, msgData }: HandlerRequest): Promise<HandlerResponse> {
    if (commandName == 'newwordle') {
        games.set(msgData.uid, new Game())
        return '[Game] Created a new game'
    } else if (commandName == 'g') {
        const guess = args[0]
        if (!guess) return null
        if (games.has(msgData.uid)) {
            const game = games.get(msgData.uid)
            const { message } = game!.check(guess.toLowerCase())
            return message
        }
    } else if (commandName == 'reveal') {
        if (games.has(msgData.uid)) {
            const game = games.get(msgData.uid)
            return `[Game] It was ${game!.randomWord.toUpperCase()}`
        }
    } else if (commandName == 'tries') {
        if (games.has(msgData.uid)) {
            const game = games.get(msgData.uid)
            game!.tries = parseInt(args[0])
            return `[Game] Change max guess to ${args[0]}`
        }
    }

    return null
}