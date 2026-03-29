import { WebContainer } from '@webcontainer/api'

let wcInstance: WebContainer | null = null
let serverUrl: string | null = null

export function useWebContainer() {
  const isReady = ref(false)
  const error = ref<string | null>(null)

  async function boot() {
    try {
      wcInstance = await WebContainer.boot()
      isReady.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to boot WebContainer'
    }
  }

  async function writeFile(path: string, content: string) {
    if (!wcInstance) throw new Error('WebContainer not initialized')
    await wcInstance.fs.writeFile(path, content)
  }

  async function startDevServer() {
    if (!wcInstance) throw new Error('WebContainer not initialized')
    
    await wcInstance.spawn('npx', ['vite', '--port', '3000'])
    
    wcInstance.on('server-ready', (port, url) => {
      serverUrl = url
    })
  }

  function getServerUrl() {
    return serverUrl
  }

  onUnmounted(async () => {
    if (wcInstance) {
      await wcInstance.teardown()
      wcInstance = null
      serverUrl = null
    }
  })

  return {
    isReady: readonly(isReady),
    error: readonly(error),
    boot,
    writeFile,
    startDevServer,
    getServerUrl,
  }
}
