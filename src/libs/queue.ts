import { EventEmitter } from 'events'
import TypedEmitter from 'typed-emitter'

type MessageEvents = {
    result: <T>(r: Result<T>) => void
}

interface Result<T> {
    error: boolean,
    data: T
}

interface ProcessFunc<I, R> {
    (data: I): R
}

export default class Queue<I, R> extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    public readonly sequential: boolean
    private processing: boolean
    private processFunc: ProcessFunc<I, R | null>
    private tasks: I[]

    constructor(options: {
        processFunc: ProcessFunc<I, R | null>,
        sequential: boolean
    }) {
        super()

        this.tasks = []
        this.processFunc = options.processFunc
        this.sequential = options.sequential
        this.processing = false
    }

    public enqueue(data: I): void {
        this.tasks.push(data)
        if (!this.processing) this.process()
    }

    private async process(): Promise<void> {
        this.processing = true
        while (this.tasks.length > 0) {
            const result = Promise.resolve(this.processFunc(this.tasks.shift()!))
            if (this.sequential) {
                try {
                    await result
                } catch (error) {
                    if (error instanceof Error) {
                        this.emit('result', {
                            error: true,
                            data: error
                        } as Result<Error>)
                    }
                }
            } else {
                result.then((r: R | null) => {
                    if (r != null) {
                        this.emit('result', {
                            error: false,
                            data: r
                        } as Result<R>)
                    }
                }).catch((error: Error) => {
                    this.emit('result', {
                        error: true,
                        data: error
                    } as Result<Error>)
                })
            }
        }
        this.processing = false
    }
}