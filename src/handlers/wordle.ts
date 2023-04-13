import { HandlerRequest } from '../router'
import Game from '../wordle'

const games = new Map<string, Game>()

export default async function define({ args, commandName, msgData }: HandlerRequest): Promise<string | null> {
    if (commandName == 'newwordle') {
        if (games.has(msgData.uid)) {
            games.get(msgData.uid)?.dispose()
        }

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
    }

    return null
}