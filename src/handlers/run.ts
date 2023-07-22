import { HandlerRequest } from '../router'

export default async function run({ body }: HandlerRequest): Promise<string | null> {
    if (process.env.GLOT_API_KEY) {
      const response = await fetch('https://glot.io/api/run/python/latest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${process.env.GLOT_API_KEY}`
        },
        body: JSON.stringify({
          files: [
            {
              name: "main.py",
              content: body
            }
          ]
        })
      })

      if (response.ok) {
        const output = await response.json()
        return output.stdout ? output.stdout : output.stderr
      }
    } else {
      console.log('[RUN] GLOT_API_KEY is required to run code')
    }

    return null
}
