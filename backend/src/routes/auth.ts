import { FastifyInstance } from 'fastify'
import { getSupabase } from '../plugins/supabase'

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/verify', async (req, reply) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing token' })
    }
    const token = authHeader.slice(7)
    const supabase = getSupabase()
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return reply.code(401).send({ error: 'Invalid token' })
    return { user }
  })
}
