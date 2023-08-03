import { HandlerRequest, HandlerResponse } from '../router'
import { db } from '../libs/firebase'
import { FieldValue } from 'firebase-admin/firestore';

export default async function catchAll({ args, msgData }: HandlerRequest): Promise<HandlerResponse> {
    const words = args[0].split(' ');
    const count = words.filter(word => {
        const noAccentWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        return ['ao', 'troll', 'die', 'chet'].includes(noAccentWord)
    }).length

    if (count > 0) {
        await db.doc('/counters/total').update({
            count: FieldValue.increment(count)
        })
        console.log(`Added ${count} to count`)

        if (!msgData.isGroupChat) {
            return '+' + count
        }
    }

    return null
}
