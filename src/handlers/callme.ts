import { HTTPRequest } from 'puppeteer-core'
import { HandlerRequest } from '../router'
import { removeImagesAndCss } from '../common'
import { createServer } from 'http'
import { parse } from 'url'
import ytdl from '@distube/ytdl-core'

const server = createServer(async (req, res) => {
    try {
        const url = parse(req.url!)
        const params = new URLSearchParams(url.query!)
        await new Promise((resolve, reject) => {
            const stream = ytdl(params.get('yt')!, { filter: (format) => format.audioCodec == 'opus' })
                .once('readable', () => {
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'audio/opus'
                    })
                })
                .on('error', (err) => reject(err))
                .on('end', () => resolve(null))
                .pipe(res)

            res.on('close', () => stream.destroy())
        })
    } catch(error) {
        console.log(error)
        res.writeHead(500)
        res.end('Internal Server Error')
    }
})

server.listen(3030)

export default async function callMe({ msgData, args, browser }: HandlerRequest): Promise<string | null> {
    if (msgData.isGroupChat || msgData.isSelf) return null

    const page = await browser.newPage()
    const url = new URL('https://messenger.com/groupcall/ROOM:/')
    url.searchParams.set('has_video', 'false')
    url.searchParams.set('initialize_video', 'false')
    url.searchParams.set('is_e2ee_mandated', 'false')
    url.searchParams.set('thread_type', '1')
    url.searchParams.set('use_joining_context', 'true')
    url.searchParams.set('users_to_ring[0]', msgData.uid)
    url.searchParams.set('peer_id', msgData.uid)

    await page.setRequestInterception(true)
    await page.setBypassCSP(true)

    let startedEvaluation = false
    let evaluated = false
    let scriptRequests: HTTPRequest[] = []

    page.on('request', async (request) => {
        if (request.isInterceptResolutionHandled()) return

        if (request.resourceType() == 'script') {
            if (!evaluated) {
                scriptRequests.push(request)
                
                if (!startedEvaluation) {
                    startedEvaluation = true
                    
                    const link = encodeURIComponent(args[0])
                    await page.evaluate(async (link) => {
                        const audioContext = new AudioContext()

                        const source = new Audio(`http://127.0.0.1:3030?yt=${link}`)
                        source.crossOrigin = 'anonymous'
                        source.preload = 'none'
                        source.loop = true

                        const sourceNode = audioContext.createMediaElementSource(source)
                        const dest = audioContext.createMediaStreamDestination()
                        sourceNode.connect(dest)

                        navigator.mediaDevices.getUserMedia = async function () {
                            return dest.stream
                        }

                        window.addEventListener('play_now', () => {
                            source.play()
                        })
                    }, link);

                    evaluated = true
                    for (const req of scriptRequests) req.continue()
                }
            } else {
                request.continue()
            }
        } else {
            removeImagesAndCss(request)
        }
    })

    await page.goto(url.toString())
    await page.waitForNetworkIdle()
    await page.click('div[role="button"]')

    const cdp = await page.target().createCDPSession()
    await cdp.send('Network.enable')
    await cdp.send('Page.enable')

    let played = false
    const cancelCallTimeout = setTimeout(() => page.close(), 30000)

    cdp.on('Network.webSocketFrameReceived', async ({ response }) => {
        const buf = Buffer.from(response.payloadData, 'base64')

        if (played && buf.includes('hang_up')) {
            console.log('Hanging up...')
            await cdp.detach()
            await page.close()
        }

        if (!played && buf.includes('ICE_CANDIDATE')) {
            played = true
            console.log('Playing audio...')
            clearTimeout(cancelCallTimeout)
            await page.evaluate(() => {
                window.dispatchEvent(new Event('play_now'))
            })
        }
    })

    return null
}
