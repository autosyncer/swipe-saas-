import { supabase } from '@/lib/supabase'

// ── CC Sheet ──────────────────────────────────────────────────────────────────
export async function createCCSheetRow(transaction: Record<string, unknown>) {
  try {
    const swapName = String(transaction.swap_name || '')
    const { data: machines } = await supabase.from('swipe_machines').select('*')
    let matchedMachine: Record<string, unknown> | null = null
    if (machines && swapName) {
      matchedMachine = (machines as Record<string, unknown>[]).find(m =>
        swapName.toUpperCase().includes(String(m.machine_name).toUpperCase()) ||
        swapName.toUpperCase().includes(String(m.account_name).toUpperCase())
      ) || null
    }
    const swipeAmount = Number(transaction.swap_amount) || Number(transaction.total_amount) || 0
    const bankCommPct = matchedMachine ? Number(matchedMachine.bank_commission_pct) : 1.320
    const bankCommission = (swipeAmount * bankCommPct) / 100
    const ourCommission = Number(transaction.commission_amount) || (swipeAmount * (Number(transaction.commission_pct) || 2.2) / 100)
    const customerAmount = swipeAmount - bankCommission
    const { error } = await supabase.from('cc_sheet').insert({
      transaction_id: transaction.id,
      machine_id: matchedMachine ? matchedMachine.id : null,
      tid: matchedMachine ? String(matchedMachine.tid) : '',
      machine_name: matchedMachine ? String(matchedMachine.machine_name) : swapName,
      date: transaction.date,
      swipe_amount: swipeAmount,
      customer_amount: customerAmount,
      bank_commission: bankCommission,
      our_commission: ourCommission,
      status: String(transaction.remarks || ''),
      customer_name: String(transaction.customer_name || ''),
      agent_code: matchedMachine ? String(matchedMachine.agent_code || '') : '',
      account_name: String(transaction.account_name || ''),
    })
    if (error) console.error('[CC Sheet] insert error:', error.message)
  } catch (err) {
    console.error('[CC Sheet] error:', err)
  }
}

// ── Chamunda Sheet ────────────────────────────────────────────────────────────
export async function createChamundaSheetRow(transaction: Record<string, unknown>) {
  try {
    const date = String(transaction.date || '')
    await supabase.rpc('initialize_chamunda_sheet', { p_date: date })

    const commPct  = Number(transaction.commission_pct) || 0
    const commType = String(transaction.commission_type || 'Inclusive')
    let commStr = `TRF ${commPct}`
    if (commType === 'Exclusive') commStr = `CH ${commPct}`
    if (commType === 'Deferred')  commStr = 'PAY PURU'

    const row: Record<string, unknown> = {
      date,
      row_type: 'transaction',
      transaction_id: transaction.id || null,
      bank_charge_pct: 3.00,
      paid_amount: Number(transaction.paid_amount) || 0,
      swap_amount: Number(transaction.swap_amount) || 0,
      commission_pct: commPct,
      commission_type: commStr,
      machine_name: String(transaction.swap_name || ''),
      sort_order: Date.now(),
    }

    // Try 'name' column first; fall back to 'card_holder' if SQL migration not yet run
    let { error } = await supabase.from('chamunda_sheet').insert({ ...row, name: String(transaction.customer_name || '') })
    if (error?.message?.includes('column') && error.message.includes('name')) {
      ;({ error } = await supabase.from('chamunda_sheet').insert({ ...row, card_holder: String(transaction.customer_name || '') }))
    }

    if (error) {
      console.error('❌ Chamunda insert failed:', error.message)
      return
    }
    await supabase.rpc('recalculate_chamunda_totals', { p_date: date })
  } catch (err) {
    console.error('❌ createChamundaSheetRow exception:', err)
  }
}

// ── Customer Sheet ────────────────────────────────────────────────────────────
export async function createCustomerSheetRow(
  transaction: Record<string, unknown>,
  customerId?: string | null
) {
  try {
    let cardNumber = '', pin = '', cvvExpiry = '', dueDate: string | null = null, cardNetwork = ''
    const bankCard = String(transaction.bank_card || '')
    if (customerId && bankCard) {
      const { data: cards } = await supabase.from('cards').select('*').eq('customer_id', customerId).ilike('bank_name', `%${bankCard}%`).limit(1)
      if (cards && cards.length > 0) {
        const c = cards[0] as Record<string, unknown>
        cardNumber = String(c.card_number || '')
        pin = String(c.pin || '')
        cvvExpiry = c.cvv ? `${c.cvv}/${c.expiry || ''}` : String(c.expiry || '')
        dueDate = c.due_date ? String(c.due_date) : null
        cardNetwork = String(c.card_type || '')
      }
    }
    const totalAmt = Number(transaction.total_amount) || 0
    const paidAmt  = Number(transaction.paid_amount) || 0
    const swapAmt  = Number(transaction.swap_amount) || 0
    const commission = Number(transaction.commission_amount) || 0
    const { error } = await supabase.from('customer_sheet').insert({
      transaction_id:  transaction.id || null,
      customer_id:     customerId || null,
      customer_name:   String(transaction.customer_name || ''),
      due_date:        dueDate,
      card:            bankCard,
      card_number:     cardNumber,
      pin,
      cvv_expiry:      cvvExpiry,
      total_amount:    totalAmt,
      paid_amount:     paidAmt,
      swap_amount:     swapAmt,
      commission,
      paid_remaining:  totalAmt - paidAmt,
      swap_pending:    swapAmt - totalAmt,
      account_name:    String(transaction.account_name || ''),
      swap_name:       String(transaction.swap_name || ''),
      paid_date:       transaction.remarks === 'PAID' || transaction.remarks === 'Paid' ? String(transaction.date || '') : null,
      card_network:    cardNetwork,
      date:            String(transaction.date || new Date().toISOString().split('T')[0]),
    })
    if (error) console.error('[Customer Sheet] insert error:', error.message)
  } catch (err) {
    console.error('[Customer Sheet] error:', err)
  }
}
