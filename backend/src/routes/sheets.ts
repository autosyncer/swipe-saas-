import { FastifyInstance } from 'fastify'
import { getSupabase } from '../plugins/supabase'

function toCell(v: unknown) {
  return { v, m: v == null ? '' : String(v), ct: { fa: 'General', t: 'g' } }
}

export async function sheetRoutes(app: FastifyInstance) {
  // Daily Register sheet
  app.get('/api/sheets/daily-register', async (req, reply) => {
    const { date } = req.query as { date?: string }
    const today = new Date().toISOString().split('T')[0]
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('date', date || today)
      .order('sr_no', { ascending: true })

    if (error) return reply.code(500).send({ error: error.message })

    const headers = ['SR NO', 'DATE', 'CUSTOMER NAME', 'BANK CARD', 'TOTAL AMOUNT', 'PAID AMOUNT', 'A/C NAME', 'SWAP AMOUNT', 'SWAP NAME', 'DIFFERENCE', 'REMARKS', 'STATUS', 'COMM %', 'COMM AMT']
    const headerRow = headers.map(h => toCell(h))
    const rows = (data || []).map(t => [
      toCell(t.sr_no),
      toCell(t.date),
      toCell(t.customer_name),
      toCell(t.bank_card),
      toCell(t.total_amount),
      toCell(t.paid_amount),
      toCell(t.account_name),
      toCell(t.swap_amount),
      toCell(t.swap_name),
      toCell(t.difference),
      toCell(t.remarks),
      toCell(t.status),
      toCell(t.commission_pct),
      toCell(t.commission_amount),
    ])

    return { name: 'Daily Register', data: [headerRow, ...rows], rawData: data }
  })

  // AC Sheet
  app.get('/api/sheets/ac', async (req, reply) => {
    const { date } = req.query as { date?: string }
    const today = new Date().toISOString().split('T')[0]
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('ac_sheet')
      .select('*')
      .eq('date', date || today)

    if (error) return reply.code(500).send({ error: error.message })

    const headers = ['DATE', 'ACCOUNT', 'OPEN BAL', 'BAL RECD', 'TRN BAL', 'AVAI BAL', 'ATM WITHD', 'WITHD', 'TRANSF', 'CC PAY', 'CUST TRF', 'CHARGES', 'CLOSING BAL']
    const headerRow = headers.map(h => toCell(h))
    const rows = (data || []).map(r => [
      toCell(r.date), toCell(r.account_name), toCell(r.open_bal), toCell(r.bal_recd),
      toCell(r.trn_bal_recd), toCell(r.avai_bal), toCell(r.atm_withd), toCell(r.withd),
      toCell(r.transf), toCell(r.cc_pay), toCell(r.cust_trf), toCell(r.charges), toCell(r.closing_bal),
    ])

    return { name: 'AC Sheet', data: [headerRow, ...rows], rawData: data }
  })

  // CC Sheet
  app.get('/api/sheets/cc', async (req, reply) => {
    const { date } = req.query as { date?: string }
    const today = new Date().toISOString().split('T')[0]
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('cc_sheet')
      .select('*')
      .eq('date', date || today)

    if (error) return reply.code(500).send({ error: error.message })

    const headers = ['DATE', 'TID', 'FIRM NAME', 'SWIPE AMOUNT', 'CHARGES', 'NET RECEIVED', 'CUSTOMER']
    const headerRow = headers.map(h => toCell(h))
    const rows = (data || []).map(r => [
      toCell(r.date), toCell(r.tid), toCell(r.firm_name), toCell(r.swipe_amount),
      toCell(r.charges_deducted), toCell(r.net_received), toCell(r.customer_name),
    ])

    return { name: 'CC Sheet', data: [headerRow, ...rows], rawData: data }
  })

  // BL Sheet
  app.get('/api/sheets/bl', async (req, reply) => {
    const { date } = req.query as { date?: string }
    const today = new Date().toISOString().split('T')[0]
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('bl_sheet')
      .select('*')
      .eq('date', date || today)

    if (error) return reply.code(500).send({ error: error.message })

    const headers = ['DATE', 'CR ACCOUNT', 'CR AMOUNT', 'DR ACCOUNT', 'DR AMOUNT', 'REFERENCE', 'PENDING', 'FIRM']
    const headerRow = headers.map(h => toCell(h))
    const rows = (data || []).map(r => [
      toCell(r.date), toCell(r.credited_account), toCell(r.credited_amount),
      toCell(r.debited_account), toCell(r.debited_amount), toCell(r.reference),
      toCell(r.pending), toCell(r.firm_name),
    ])

    return { name: 'BL Sheet', data: [headerRow, ...rows], rawData: data }
  })
}
