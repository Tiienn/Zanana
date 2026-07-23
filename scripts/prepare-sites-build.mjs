import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const distDir = new URL('../dist/', import.meta.url)
const clientDir = new URL('../dist/client/', import.meta.url)
const serverDir = new URL('../dist/server/', import.meta.url)

await mkdir(clientDir, { recursive: true })

for (const entry of await readdir(distDir, { withFileTypes: true })) {
  if (entry.name === 'client' || entry.name === 'server' || entry.name === '.openai') continue
  await cp(join(distDir.pathname, entry.name), join(clientDir.pathname, entry.name), {
    recursive: true,
  })
}

await mkdir(serverDir, { recursive: true })
await writeFile(
  new URL('index.js', serverDir),
  `const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (
      response.status !== 404 ||
      request.method !== 'GET' ||
      !(request.headers.get('accept') || '').includes('text/html')
    ) {
      return response
    }

    const fallbackUrl = new URL('/index.html', request.url)
    return env.ASSETS.fetch(new Request(fallbackUrl, request))
  },
}

export default worker
`,
)
