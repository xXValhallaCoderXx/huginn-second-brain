import 'dotenv/config'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { type HonoBindings, type HonoVariables, MastraServer } from '@mastra/hono'
import { getServerPort } from './config/runtime.js'
import { mastra } from './mastra/index.js'

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>()
const server = new MastraServer({ app, mastra })
const port = getServerPort()

await server.init()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0'
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
