import Words from './words'
import EventEmitter from 'events'

interface CheckResult {
    ended: boolean,
    message: string
}

export default class Game extends EventEmitter {
    private _randomWord: string = ''
    private _tries: number = 15
    private _history: string[] = []
    private _ended: boolean = false
    private readonly wordsInstance: Words

    get randomWord(): string {
        return this._randomWord
    }

    get tries(): number {
        return this._tries
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
        this.wordsInstance.on('done', this.random.bind(this))
    }

    private random() {
        this._randomWord = this.wordsInstance.getRandom()
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
                for (let i = 0; i < 5; i++) {
                    if (this.randomWord.includes(word[i])) {
                        if (this.randomWord[i] == word[i]) guessResult += ` ${word[i].toUpperCase()} `
                        else guessResult += ` ${word[i]} `
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