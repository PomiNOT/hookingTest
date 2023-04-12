import readline from 'readline'
import EventEmitter from 'events'
import TypedEmitter from 'typed-emitter'
import fs from 'fs'

type MessageEvents = {
    done: () => void
}

export default class Words extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    private words: { [k: string]: boolean } = {}
    private answers: string[] = []
    private _loaded: boolean = false
    private static _instance: Words | undefined
    get loaded(): boolean {
        return this._loaded
    }

    constructor() {
        super()
    }

    static getInstance(): Words {
        if(!this._instance) {
            this._instance = new Words()
            this._instance.loadWords()
        }
        return this._instance
    }
    
    loadWords() {
        if (this._loaded) this.emit('done')
        let loadedCount = 0

        const wordsStream = fs.createReadStream('./assets/words')
        const answersStream = fs.createReadStream('./assets/answers')
        const rlWords = readline.createInterface({ input: wordsStream })
        const rlAnswers = readline.createInterface({ input: answersStream })

        const onDone = () => {
            loadedCount++

            if (loadedCount == 2) {
                this._loaded = true
                this.emit('done')
            }
        }
        
        rlWords.on('line', (word) => this.words[word] = true)
        rlWords.on('close', onDone)
        rlAnswers.on('line', (word) => {
            this.answers.push(word)
            if (word.length < 5) console.log(word)
        })
        rlAnswers.on('close', onDone)
    }

    exists(word: string): boolean {
        return this.words[word] ?? false
    }

    getRandom(): string {
        return this.answers[Math.floor(Math.random() * this.answers.length)]
    }
}