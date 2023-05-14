import { HandlerRequest } from '../router'

export default async function run({ args }: HandlerRequest): Promise<string | null> {
    const expr = args.join(' ')

    if (process.env.GLOT_API_KEY) {
      const response = await fetch('https://glot.io/api/run/java/latest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${process.env.GLOT_API_KEY}`
        },
        body: JSON.stringify({
          files: [
            {
              name: "Main.java",
              content: expr
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
