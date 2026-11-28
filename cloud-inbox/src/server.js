import { createServer } from 'node:http'
import { createApp } from './app.js'
import { assertServerConfig, loadConfig } from './config.js'
import { createDeepSeekClient } from './deepseek.js'
import { createFirestoreStore } from './storage/firestoreStore.js'
import { createMemoryStore } from './storage/memoryStore.js'

const config = loadConfig(process.env)
assertServerConfig(config)

if (!config.inboxToken) {
  console.warn(
    '[jizhang-cloud-inbox] warning: INBOX_TOKEN is empty; protected endpoints will return 401',
  )
}

const store =
  config.storageMode === 'memory'
    ? createMemoryStore()
    : createFirestoreStore({ collectionPrefix: config.firestoreCollectionPrefix })

const aiClient = createDeepSeekClient({
  apiKey: config.deepseekApiKey,
  baseUrl: config.deepseekBaseUrl,
  model: config.deepseekModel,
})

const handler = createApp({ config, store, aiClient })
const server = createServer(handler)

server.listen(config.port, '0.0.0.0', () => {
  console.info(
    `[jizhang-cloud-inbox] listening on port ${config.port} (storage=${config.storageMode}, tz=${config.defaultTimezone})`,
  )
})

function shutdown() {
  server.close(() => {
    process.exitCode = 0
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
