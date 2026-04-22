import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authRoutes } from './routes/auth'
import { customerRoutes } from './routes/customers'
import { transactionRoutes } from './routes/transactions'
import { sheetRoutes } from './routes/sheets'

const app = Fastify({ logger: true })

async function main() {
  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  // Health check
  app.get('/', async () => ({ status: 'ok', app: 'SwipeSaaS API' }))

  // Routes
  await app.register(authRoutes)
  await app.register(customerRoutes)
  await app.register(transactionRoutes)
  await app.register(sheetRoutes)

  const port = process.env.PORT ? parseInt(process.env.PORT) : 4002
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`SwipeSaaS API running on http://localhost:${port}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
