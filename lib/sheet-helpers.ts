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
      sr_no: transaction.sr_no ? Number(transaction.sr_no) : null,
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
    console.log('[Chamunda] createChamundaSheetRow called for date:', date)
    const { error: rpcErr } = await supabase.rpc('initialize_chamunda_sheet', { p_date: date })
    if (rpcErr) console.warn('[Chamunda] initialize RPC error (non-fatal):', rpcErr.message)

    const commPct  = Number(transaction.commission_pct) || 0
    const commType = String(transaction.commission_type || 'Inclusive')
    let commStr = `TRF ${commPct}`
    if (commType === 'Exclusive') commStr = `CH ${commPct}`
    if (commType === 'Deferred')  commStr = 'PAY PURU'

    // Only put paid_in_cash in Chamunda Sheet when payment was actual cash (not ATM/WITHD/TRANSF/CC PAY/CUST TRF)
    const cashType = String(transaction.cash_type || '')
    const isCashPayment = !cashType || cashType === 'CASH'

    const row: Record<string, unknown> = {
      date,
      row_type: 'transaction',
      transaction_id: transaction.id || null,
      bank_charge_pct: 3.00,
      paid_amount: Number(transaction.paid_amount) || 0,
      ...(transaction.paid_in_cash && isCashPayment ? { paid_in_cash: Number(transaction.paid_in_cash) } : {}),
      swap_amount: Number(transaction.swap_amount) || 0,
      commission_pct: commPct,
      commission_type: commStr,
      machine_name: String(transaction.swap_name || ''),
    }

    // Try 'name' column first; fall back to 'card_holder' if SQL migration not yet run
    let { error } = await supabase.from('chamunda_sheet').insert({ ...row, name: String(transaction.customer_name || '') })
    if (error?.message?.includes('column') && error.message.includes('name')) {
      ;({ error } = await supabase.from('chamunda_sheet').insert({ ...row, card_holder: String(transaction.customer_name || '') }))
    }

    if (error) {
      console.error('❌ Chamunda insert failed:', error.message, error.details, error.hint)
      return
    }
    console.log('✅ Chamunda row inserted for date:', date)
    await supabase.rpc('recalculate_chamunda_totals', { p_date: date })
  } catch (err) {
    console.error('❌ createChamundaSheetRow exception:', err)
  }
}

// ── Commission Sheet ──────────────────────────────────────────────────────────
export async function createCommissionSheetRow(
  transaction: Record<string, unknown>,
  paymentMode?: string | null,
  paymentModeDetail?: string | null,
) {
  try {
    const commType   = String(transaction.commission_type || 'Inclusive')
    const commAmount = Number(transaction.commission_amount) || 0
    const commPct    = Number(transaction.commission_pct) || 0

    const isDeferred = commType === 'Deferred'
    // Inclusive & Exclusive are paid at transaction time; only Deferred is pending
    const isPaid = !isDeferred

    // Inclusive has no external payment mode; Exclusive carries the mode chosen in the form
    const storedMode   = commType === 'Exclusive' ? (paymentMode || null) : null
    const storedDetail = commType === 'Exclusive' ? (paymentModeDetail || null) : null

    const { error } = await supabase.from('commission_sheet').insert({
      transaction_id:      transaction.id || null,
      date:                String(transaction.date || ''),
      sr_no:               transaction.sr_no ? Number(transaction.sr_no) : null,
      customer_name:       String(transaction.customer_name || ''),
      swap_machine:        String(transaction.swap_name || ''),
      commission_pct:      commPct,
      commission_amount:   commAmount,
      commission_type:     commType,
      payment_mode:        storedMode,
      payment_mode_detail: storedDetail,
      status:              isPaid ? 'Paid' : 'Pending',
      paid_date:           isPaid ? String(transaction.date || '') : null,
      paid_amount:         isPaid ? commAmount : 0,
    })
    if (error) console.error('[Commission Sheet] insert error:', error.message)

    // Deferred → auto-create a reminder for 7 days later
    if (isDeferred && commAmount > 0) {
      const txDate = String(transaction.date || '')
      const reminderDate = new Date(txDate)
      reminderDate.setDate(reminderDate.getDate() + 7)
      const rDate = reminderDate.toISOString().split('T')[0]
      await supabase.from('reminders').insert({
        title:         `Collect commission — ${String(transaction.customer_name || '')}`,
        description:   `SR #${transaction.sr_no || ''} · ₹${commAmount} · ${commPct}% commission`,
        reminder_date: rDate,
        reminder_time: '10:00:00',
        type:          'commission',
        customer_name: String(transaction.customer_name || ''),
        amount:        commAmount,
        status:        'pending',
      }).then(({ error: rErr }) => {
        if (rErr) console.warn('[Commission Reminder] insert error:', rErr.message)
      })
    }

    // Cash commission → chamunda sheet below L-15 as opening_person entry
    if (storedMode === 'Cash' && commAmount > 0) {
      const txDate = String(transaction.date || '')
      // Ensure the date is initialised before inserting the person row
      await supabase.rpc('initialize_chamunda_sheet', { p_date: txDate })
      const { error: cErr } = await supabase.from('chamunda_sheet').insert({
        date:           txDate,
        row_type:       'opening_person',
        sort_order:     35,             // L-15 is 30, so this sits just below it
        opening_name:   String(transaction.customer_name || ''),
        opening_amount: commAmount,
        transaction_id: transaction.id || null,
      })
      if (cErr) console.warn('[Commission→Chamunda] insert error:', cErr.message)
      else await supabase.rpc('recalculate_chamunda_totals', { p_date: txDate })
    }
  } catch (err) {
    console.error('[Commission Sheet] error:', err)
  }
}

// ── Customer Sheet ────────────────────────────────────────────────────────────
export async function createCustomerSheetRow(
  transaction: Record<string, unknown>,
  customerId?: string | null,
  reminderDate?: string | null
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
        cardNetwork = String(c.card_type || '')
      }
    }
    // Only use reminder date from entry form — ignore card's due_date
    dueDate = reminderDate || null
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
      date:            String(transaction.date || (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()),
    })
    if (error) console.error('[Customer Sheet] insert error:', error.message)
  } catch (err) {
    console.error('[Customer Sheet] error:', err)
  }
}
