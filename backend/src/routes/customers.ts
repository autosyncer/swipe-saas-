import { FastifyInstance } from 'fastify'
import { getSupabase } from '../plugins/supabase'

export async function customerRoutes(app: FastifyInstance) {
  // Search customers by name (autocomplete)
  app.get('/api/customers/search', async (req, reply) => {
    const { q } = req.query as { q?: string }
    if (!q || q.trim().length < 1) return { customers: [] }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('customers')
      .select('*, cards(*)')
      .ilike('name', `%${q.trim()}%`)
      .eq('cards.is_active', true)
      .limit(10)

    if (error) return reply.code(500).send({ error: error.message })
    return { customers: data }
  })

  // Get single customer with cards
  app.get('/api/customers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('customers')
      .select('*, cards(*)')
      .eq('id', id)
      .single()

    if (error) return reply.code(404).send({ error: 'Customer not found' })
    return { customer: data }
  })

  // Create customer
  app.post('/api/customers', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('customers')
      .insert(body)
      .select()
      .single()

    if (error) return reply.code(400).send({ error: error.message })
    return reply.code(201).send({ customer: data })
  })

  // Update customer
  app.patch('/api/customers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('customers')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.code(400).send({ error: error.message })
    return { customer: data }
  })
}
