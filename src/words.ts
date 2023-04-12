import readline from 'readline'
import EventEmitter from 'events'
import TypedEmitter from 'typed-emitter'
import fs from 'fs'

type MessageEvents = {
    done: () => void
}

export default class Words extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    private words: { [k: string]: boolean } = {}
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

        const stream = fs.createReadStream('./assets/words')
        const iFace = readline.createInterface({
            input: stream
        })

        iFace.on('line', (word) => this.words[word] = true)
        iFace.on('close', () => {
            this._loaded = true
            this.emit('done')
        })
    }

    exists(word: string): boolean {
        return this.words[word] ?? false
    }

    getRandom(): string {
        const words = Object.keys(this.words)
        return words[Math.floor(Math.random() * words.length)]
    }
}