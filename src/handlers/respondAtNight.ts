import { HandlerRequest } from '../router'
import { DateTime } from 'luxon'
import { TypingData } from '../router'

const MESSAGES = [
    'shhh!! cậu chủ đang thư giãn 😴',
    'trợ lý của cậu chủ here, cậu ấy đang bật do not disturb, đừng làm cậu ấy cáu 😝',
    'STOP! tôi sẽ bị đuổi việc nếu bạn nhắn tin, cậu chủ đang nghỉ ngơi',
    'đừng bấm gửi, i am 😴-ing',
    'Xin đừng làm phiền, cậu chủ đang cần tĩnh lặng để tập trung nghỉ ngơi.',
    'Hãy để cậu chủ thư giãn và sẵn sàng cho những thách thức tiếp theo.',
    'Sorry, cậu chủ đang trong thời gian nghỉ ngơi, vui lòng liên hệ sau.',
    'Cậu chủ đã đặt chế độ im lặng để tập trung cho giấc ngủ, xin hãy giữ im lặng.',
    'Bạn có thể đợi một chút không? Cậu chủ đang trong quá trình nghỉ ngơi và sẽ trả lời bạn sau khi trở lại.'
]


let lasts: Map<string, number> = new Map()

export default async function respondAtNight({ msgData, kv }: HandlerRequest): Promise<string | null> {
    const now = DateTime.now().setZone('Asia/Ho_Chi_Minh')
    if (lasts.has(msgData.uid)) {
        const diff = Date.now() - lasts.get(msgData.uid)!
        console.log(diff)
        if (diff < 10000) return null
    }
    
    const isNighttime = now.hour >= 22 || now.hour < 6
    if ((msgData as TypingData).typing && (isNighttime || kv?.store.get('busy') as boolean == true)) {
        lasts.set(msgData.uid, Date.now())
        const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
        console.log('Sending DO NOT DISTURB to ' + msgData.uid)
        return message
    }

    return null
}
