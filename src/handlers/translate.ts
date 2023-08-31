import { HandlerRequest, HandlerResponse, NewMessageData } from '../router'

const ERROR_MESSAGE = '[Translation] No TRANSLATE_API_KEY, please specify one'

if (!process.env.TRANSLATE_API_KEY) {
    console.log(ERROR_MESSAGE)
}

async function translateAPI(text: string, language = 'en'): Promise<string | null> {
    if (process.env.TRANSLATE_API_KEY) {
        const url = new URL('https://translation.googleapis.com/language/translate/v2')
        url.searchParams.append('q', text)
        url.searchParams.append('target', language)
        url.searchParams.append('format', 'text')
        url.searchParams.append('model', 'nmt')
        url.searchParams.append('key', process.env.TRANSLATE_API_KEY)

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`${response.status} - ${response.statusText}`)
        }

        const json = await response.json()
        const translations: { translatedText: string }[] | undefined = json?.data?.translations
        if (!translations) return null

        return translations[0]?.translatedText
    } else {
        return null
    }
}

function getExpirationDate(from: Date, durationSecs: number): Date {
    return new Date(from.getTime() + durationSecs * 1000)
}

class Session {
    private userId: string
    private _targetLanguage: string
    private expires: Date

    constructor(userId: string, expires: Date) {
        this.userId = userId
        this.expires = expires
        this._targetLanguage = 'en'
    }

    public isValid(): boolean {
        return Date.now() <= this.expires.getTime()
    }

    public prolong(timeoutSecs: number) {
        this.expires = getExpirationDate(new Date(), timeoutSecs)
    }

    get targetLanguage(): string {
        return this._targetLanguage
    }

    set targetLanguage(lang: string) {
        if (lang.length === 2) {
            this._targetLanguage = lang
        }
    }
}

class SessionManager {
    static sessions: Map<string, Map<string, Session>> = new Map()

    public static createSession(roomId: string, userId: string, timeoutSecs: number) {
        let room = this.sessions.get(roomId)
        if (!room) {
            room = new Map()
            this.sessions.set(roomId, room)
        }

        room.set(userId, new Session(userId, getExpirationDate(new Date(), timeoutSecs)))
    }

    public static getSession(roomId: string, userId: string): Session | null {
        const room = this.sessions.get(roomId)
        if (!room) return null
        const session = room.get(userId)
        if (!session) return null
        return session
    }

    public static deleteSession(roomId: string, userId: string) {
        const room = this.sessions.get(roomId)
        if (!room) return
        room.delete(userId)
        if (room.size === 0) this.sessions.delete(roomId)
    }
}

export default async function translate({ args, body, kv, commandName, msgData }: HandlerRequest): Promise<HandlerResponse> {
    const { isBot, isGroupChat, senderUid, uid } = msgData as NewMessageData;
    if (isBot || isGroupChat) return null;

    let timeout = 10 * 60
    const timeoutSetting = kv?.store.get('translate_timeout')
    if (timeoutSetting) {
        timeout = parseInt(timeoutSetting)
    }

    if (commandName === 'translate_me') {
        if (args[0] && args[0] === 'off') {
            SessionManager.deleteSession(uid, senderUid)
            return `You are removed from the list of participants`
        }

        SessionManager.createSession(uid, senderUid, timeout)
        return `You are added to the list of participants`
    } else if (commandName === 'set_language') {
        if (args[0]) {
            const language = args[0]
            const session = SessionManager.getSession(uid, senderUid)
            if (session) {
                session.targetLanguage = language
                return `Your messages will be translated to ${language}`
            }
        }
    } else if (commandName === '*') {
        const session = SessionManager.getSession(uid, senderUid)
        if (session && session.isValid()) {
            session.prolong(timeout)
            const text = await translateAPI(body, session.targetLanguage)
            return text
        } else if (session) {
            SessionManager.deleteSession(uid, senderUid)
            return 'Your session has expired, type !translate_me to continue translating messages'
        }
    }

    return null
}