import { describe, expect, test } from '@jest/globals'
import Game from '../src/wordle'

describe('Wordle game', () => {
    test('Load assets', (done) => {
        const game = new Game()
        game.on('done', () => {
            expect(game.randomWord.length).toEqual(5)
            done()
        })
    })

    test('Generate random words', (done) => {
        let count = 0
        for (let i = 0; i < 10; i++) {
            const game = new Game()
            game.on('done', () => {
                expect(game.randomWord.length).toEqual(5)
                count++
                if (count == 10) done()
            })
        }
    })

    test('Test correct answer', (done) => {
        const game = new Game()
        game.on('done', () => {
            game.check(game.randomWord)
            expect(game.ended).toBe(true)
            done()
        })
    })

    test('Test all wrong answers', () => {
        const game = new Game()
        game.setWord('yahoo')
        const tries = game.tries
        for (let i = 0; i < tries; i++) {
            game.check('apple')
        }
        expect(game.ended).toBe(true)
    })

    test('Test display incorrect positions', () => {
        const game = new Game()
        game.setWord('three')
        game.check('apply')
        expect(game.history[0]).toBe(' _  _  _  _  _ ')
        game.check('enact')
        expect(game.history[1]).toBe(' e  _  _  _  t ')
        game.check('trees')
        expect(game.history[2]).toBe(' T  r  e  E  _ ')
        game.setWord('point')
        game.check('yahoo')
        expect(game.history[3]).toBe(' _  _  _  o  _ ')
    })
})