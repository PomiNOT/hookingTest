import KVStore from '../src/libs/kv'
import { describe, expect, test, beforeAll, afterAll, afterEach } from '@jest/globals'
import { Server } from 'http'

describe('KVStore', () => {
  let server: Server
  let kv = new KVStore()

  beforeAll(() => {
    server = kv.serve(8080, 'secret-key')
  })

  afterAll((done) => {
    server.close()
    server.on('close', () => done())
  })

  afterEach(() => {
    kv.store.clear()
  })

  test('GET returns the current time', async () => {
    const res = await fetch('http://localhost:8080')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(Number(body)).toBeCloseTo(Date.now(), -3)
  })

  test('POST /updatekv with valid authorization and JSON body updates the store', async () => {
    const res = await fetch('http://localhost:8080/updatekv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'secret-key',
      },
      body: JSON.stringify({ foo: 'bar' }),
    })
    expect(res.status).toBe(200)
    expect(kv.store.get('foo')).toBe('bar')
  })

  test('POST /updatekv with invalid authorization returns 403', async () => {
    const res = await fetch('http://localhost:8080/updatekv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'invalid-key',
      },
      body: JSON.stringify({ foo: 'bar' }),
    })
    expect(res.status).toBe(403)
    expect(kv.store.get('foo')).toBe(undefined)
  })

  test('POST /updatekv with invalid JSON body returns 400', async () => {
    const res = await fetch('http://localhost:8080/updatekv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'secret-key',
      },
      body: 'invalid json',
    })
    expect(res.status).toBe(400)
    expect(kv.store.get('foo')).toBe(undefined)
  })

  test('POST with invalid content type returns 400', async () => {
    const res = await fetch('http://localhost:8080/updatekv', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: 'secret-key',
      },
      body: JSON.stringify({ foo: 'bar' }),
    })
    expect(res.status).toBe(400)
    expect(kv.store.get('foo')).toBe(undefined)
  })

  test('Unsupported method returns 405', async () => {
    const res = await fetch('http://localhost:8080/unsupported', {
      method: 'PUT',
    })
    expect(res.status).toBe(405)
    expect(kv.store.get('foo')).toBe(undefined)
  })
})
