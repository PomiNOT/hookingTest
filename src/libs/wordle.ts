import Words from './words.js'
import { EventEmitter } from 'events'
import TypedEmitter from 'typed-emitter'

interface CheckResult {
    ended: boolean,
    message: string
}

type MessageEvents = {
    done: () => void
}

type VoidFunc = () => void

export default class Game extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    private _randomWord: string = ''
    private _tries: number = 6
    private _history: string[] = []
    private _ended: boolean = false
    private _randomWordFunc: VoidFunc | null = null
    private readonly wordsInstance: Words

    get randomWord(): string {
        return this._randomWord
    }

    get tries(): number {
        return this._tries
    }

    set tries(max: number) {
        if (max < 0) throw new Error('Max tries must be positive')
        this._tries = max
    }

    get history(): string[] {
        return this._history
    }

    get ended(): boolean {
        return this._ended
    }

    constructor() {
        super()

        this.wordsInstance = Words.getInstance()
        this._randomWordFunc = () => {
            this.random()
            this.wordsInstance.off('done', this._randomWordFunc!)
            this._randomWordFunc = null
        }
        this.wordsInstance.on('done', this._randomWordFunc)
    }

    public random() {
        this._randomWord = this.wordsInstance.getRandom()
        this.emit('done')
    }

    public setWord(word: string) {
        if (word.length != 5) throw new Error('Word must have length 5')
        this._randomWord = word
    }

    public check(word: string): CheckResult {
        if (!this.wordsInstance.loaded) return { ended: this.ended, message: '[Game] Words are still loading, please try again later!' }
        if (this.ended) return { ended: this.ended, message: '[Game] This game has ended' }

        if (this.wordsInstance.exists(word)) {
            this._tries--

            if (word == this.randomWord) {
                this._ended = true
                return { ended: this.ended, message: `[Game] Congrats! The word was ${this.randomWord.toUpperCase()}` }
            } else {                
                let guessResult = ''

                let lettersCount: { [k: string]: number } = {}
                
                for (const c of this.randomWord) {
                    lettersCount[c] = (lettersCount[c] ?? 0) + 1
                }

                for (let i = 0; i < 5; i++) {
                    if (lettersCount[word[i]] > 0) {
                        if (this.randomWord[i] == word[i]) guessResult += ` ${word[i].toUpperCase()} `
                        else guessResult += ` ${word[i]} `
                        lettersCount[word[i]]--
                    } else {
                        guessResult += ' _ '
                    }
                }

                this.history.push(guessResult)

                if (this.tries <= 0) {
                    this._ended = true
                    return { ended: this.ended, message: `${this.history.join('\n')}\nGame over! The word was ${this.randomWord.toUpperCase()}` }
                } else {
                    return { ended: this.ended, message: `${this.history.join('\n')}\n${this.tries} left` }
                }
            }

        } else {
            return { ended: this.ended, message: '[Game] This word does not exist' }
        }
    }
}