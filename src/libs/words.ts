import { createInterface } from 'readline'
import { EventEmitter } from 'events'
import TypedEmitter from 'typed-emitter'
import { createReadStream } from 'fs'

type MessageEvents = {
    done: () => void
}

export default class Words extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    private words: { [k: string]: boolean } = {}
    private answers: string[] = []
    private _loaded: boolean = false
    private _loadCalled: boolean = false
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
        }
        this._instance.loadWords()
        return this._instance
    }
    
    public loadWords() {
        if (this._loadCalled) {
            if (this._loaded) this.emit('done')
        }
        let loadedCount = 0
        this._loadCalled = true

        const wordsStream = createReadStream('./assets/words')
        const answersStream = createReadStream('./assets/answers')
        const rlWords = createInterface({ input: wordsStream })
        const rlAnswers = createInterface({ input: answersStream })

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

    public exists(word: string): boolean {
        return this.words[word] ?? false
    }

    public getRandom(): string {
        return this.answers[Math.floor(Math.random() * this.answers.length)]
    }
}