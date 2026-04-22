import { FastifyInstance } from 'fastify'
import { getSupabase } from '../plugins/supabase'
import { CreateTransactionBody } from '../types'

export async function transactionRoutes(app: FastifyInstance) {
  // Create transaction (atomic multi-table insert)
  app.post('/api/transactions', async (req, reply) => {
    const body = req.body as CreateTransactionBody
    const supabase = getSupabase()

    const date = body.date || new Date().toISOString().split('T')[0]
    const diff = (body.swap_amount ?? 0) - (body.total_amount ?? 0)
    const commAmt = body.commission_amount ?? ((body.total_amount ?? 0) * (body.commission_pct ?? 0) / 100)

    try {
      // 1. Insert transaction
      const { data: txn, error: txnErr } = await supabase
        .from('transactions')
        .insert({
          date,
          customer_id: body.customer_id,
          customer_name: body.customer_name,
          bank_card: body.bank_card,
          total_amount: body.total_amount,
          paid_amount: body.paid_amount,
          account_name: body.account_name,
          swap_amount: body.swap_amount,
          swap_name: body.swap_name,
          difference: diff,
          remarks: body.remarks,
          status: body.status ?? 'Pending',
          commission_pct: body.commission_pct,
          commission_amount: commAmt,
        })
        .select()
        .single()

      if (txnErr) throw txnErr

      // 2. Insert cc_sheet
      const chargesDeducted = (body.total_amount ?? 0) * ((body.commission_pct ?? 3) / 100)
      const { data: ccRow, error: ccErr } = await supabase
        .from('cc_sheet')
        .insert({
          date,
          firm_name: body.swap_name,
          swipe_amount: body.total_amount,
          charges_deducted: chargesDeducted,
          net_received: (body.total_amount ?? 0) - chargesDeducted,
          customer_name: body.customer_name,
          customer_id: body.customer_id,
          transaction_id: txn.id,
        })
        .select()
        .single()

      if (ccErr) throw ccErr

      // 3. Upsert ac_sheet — find existing row for (date, account_name)
      const { data: existingAc } = await supabase
        .from('ac_sheet')
        .select('*')
        .eq('date', date)
        .eq('account_name', body.account_name)
        .single()

      let acRow
      if (existingAc) {
        const { data: updated, error: acErr } = await supabase
          .from('ac_sheet')
          .update({ bal_recd: (existingAc.bal_recd ?? 0) + (body.paid_amount ?? 0) })
          .eq('id', existingAc.id)
          .select()
          .single()
        if (acErr) throw acErr
        acRow = updated
      } else {
        // Carry previous day's closing_bal as open_bal
        const prevDate = new Date(date)
        prevDate.setDate(prevDate.getDate() - 1)
        const prevDateStr = prevDate.toISOString().split('T')[0]

        const { data: prevAc } = await supabase
          .from('ac_sheet')
          .select('closing_bal')
          .eq('date', prevDateStr)
          .eq('account_name', body.account_name)
          .single()

        const { data: newAc, error: acErr } = await supabase
          .from('ac_sheet')
          .insert({
            date,
            account_name: body.account_name,
            open_bal: prevAc?.closing_bal ?? 0,
            bal_recd: body.paid_amount ?? 0,
          })
          .select()
          .single()
        if (acErr) throw acErr
        acRow = newAc
      }

      // 4. Insert bl_sheet
      const { data: blRow, error: blErr } = await supabase
        .from('bl_sheet')
        .insert({
          date,
          credited_account: body.account_name,
          credited_amount: body.paid_amount ?? 0,
          firm_name: body.customer_name,
          reference: txn.id,
          pending: (body.total_amount ?? 0) - (body.paid_amount ?? 0),
        })
        .select()
        .single()

      if (blErr) throw blErr

      // 5. Update customer outstanding_balance
      if (body.customer_id) {
        const { data: cust } = await supabase
          .from('customers')
          .select('outstanding_balance')
          .eq('id', body.customer_id)
          .single()

        const outstanding = (cust?.outstanding_balance ?? 0) + (body.total_amount ?? 0) - (body.paid_amount ?? 0)
        await supabase
          .from('customers')
          .update({ outstanding_balance: outstanding })
          .eq('id', body.customer_id)
      }

      return reply.code(201).send({ transaction: txn, cc_sheet: ccRow, ac_sheet: acRow, bl_sheet: blRow })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.code(500).send({ error: msg })
    }
  })

  // Get transactions with filters
  app.get('/api/transactions', async (req, reply) => {
    const { date, account, status } = req.query as { date?: string; account?: string; status?: string }
    const supabase = getSupabase()

    let query = supabase.from('transactions').select('*').order('created_at', { ascending: false })

    if (date) query = query.eq('date', date)
    if (account) query = query.eq('account_name', account)
    if (status) query = query.eq('status', status)

    const { data, error } = await query.limit(100)
    if (error) return reply.code(500).send({ error: error.message })
    return { transactions: data }
  })

  // Update transaction
  app.patch('/api/transactions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('transactions')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.code(400).send({ error: error.message })
    return { transaction: data }
  })
}
