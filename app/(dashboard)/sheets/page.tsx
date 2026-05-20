'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Plus, Search, RefreshCw, Download, X, Table2, Settings2,
  ChevronLeft, ChevronRight, SlidersHorizontal, ArrowUpDown,
  CheckCircle2, Pencil, Bell,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'
import { saveTransactionToStorage } from '@/lib/transaction-backup'
import AcSheetView from '@/components/sheets/AcSheetView'
import ChamundaSheetView from '@/components/sheets/ChamundaSheetView'

// ── Types ──────────────────────────────────────────────────────────────────────
interface TxRow {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  total_amount: number | null
  paid_amount: number | null
  account_name: string
  swap_amount: number | null
  swap_name: string
  difference: number | null
  remarks: string
  commission_type?: string
}

interface ColDef { key: keyof TxRow | '_row'; label: string; width: number; align?: 'right'; editable?: boolean }

// ── Constants ──────────────────────────────────────────────────────────────────
const REMARKS_OPTS = ['PAID', 'PEND', 'PURU', 'UNPAID', 'SE', 'CANCEL']

const ACCOUNT_OPTIONS = [
  'KTC INDUS','MAP IND','RT IND','BGM IND','SKT INDUS','MAP INDUS',
  'RT INDUS','BGM INDUS','NTC INDUS','SKT FDRL','NGM INDUS',
  'MAP IND+RT IND','MGs FDRL','SST FDRL','NTC FDRL','KTC FDRL',
  'MAP FDRL','TAPI FDRL','BGM FDRL','TAPI BOB','KTC BOB',
  'MNS BOB','NGM BOB','SKT FINK','NTC BOB','RT BOB',
  'MAP BOB','SKT BOB','NSS FDRL','BGM BOB',
]

const SWAP_SUGGESTIONS = [
  'RT','BGM YES','NTC YES','SKT IND','KTC YES','MAP IND',
  'BGM IND','NTC IND','SST','MGS BOB','KTC BOB','KTC B',
  'SKT FINK','SST QR','TAPI B','RT IND','SKT FDRL','NTC B','MAP FDRL','KTC FDRL',
]

const MONTH_TABS = [
  { label:'APRIL',    month:4,  year:2025 },
  { label:'MAY',      month:5,  year:2025 },
  { label:'JUNE',     month:6,  year:2025 },
  { label:'JULY',     month:7,  year:2025 },
  { label:'AUGUST',   month:8,  year:2025 },
  { label:'SEPTEMBER',month:9,  year:2025 },
  { label:'OCTOBER',  month:10, year:2025 },
  { label:'NOVEMBER', month:11, year:2025 },
  { label:'DECEMBER', month:12, year:2025 },
  { label:'JANUARY',  month:1,  year:2026 },
  { label:'FEBRUARY', month:2,  year:2026 },
  { label:'MARCH',    month:3,  year:2026 },
]

const COLS: ColDef[] = [
  { key:'_row',          label:'#',             width:40  },
  { key:'sr_no',         label:'SR NO',         width:70  },
  { key:'date',          label:'DATE',          width:110 },
  { key:'customer_name', label:'CUSTOMER NAME', width:180, editable:true },
  { key:'bank_card',     label:'BANK CARD',     width:90,  editable:true },
  { key:'total_amount',  label:'TOTAL AMOUNT',  width:120, align:'right', editable:true },
  { key:'paid_amount',   label:'PAID AMOUNT',   width:110, align:'right', editable:true },
  { key:'account_name',  label:'A/C NAME',      width:150, editable:true },
  { key:'swap_amount',   label:'SWAP AMOUNT',   width:120, align:'right', editable:true },
  { key:'swap_name',     label:'SWAP NAME',     width:150, editable:true },
  { key:'difference',    label:'DIFFERENCE',    width:100, align:'right', editable:true },
  { key:'remarks',          label:'REMARKS',   width:90,  editable:true },
  { key:'commission_type',  label:'COMM TYPE', width:110, editable:true },
]

const LEFT_SHEETS = [
  { id:'daily_register',  label:'daily_register',  ready:true  },
  { id:'ac_sheet',        label:'ac_sheet',        ready:true  },
  { id:'cc_sheet',        label:'cc_sheet',        ready:true  },
  { id:'bl_sheet',        label:'bl_sheet',        ready:false },
  { id:'chamunda_sheet',  label:'chamunda_sheet',  ready:true  },
  { id:'customer_sheet',  label:'customer_sheet',  ready:true  },
]

const PAGE_SIZES = [25, 50, 100, 200]

function getDefaultMonthIdx() {
  const now = new Date()
  const idx = MONTH_TABS.findIndex(t => t.month === now.getMonth()+1 && t.year === now.getFullYear())
  return idx >= 0 ? idx : 4 // default august
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  const [y,m,day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}/${y.slice(2)}`
}

function fmtAmt(n: number|null|undefined) {
  if (n == null) return ''
  return n.toLocaleString('en-IN')
}

function remarkColor(r: string|null|undefined): string {
  if(!r) return '#374151'
  const m: Record<string,string> = {
    PAID:'#16a34a', PEND:'#d97706', PURU:'#2563eb',
    UNPAID:'#dc2626', SE:'#7c3aed', CANCEL:'#9ca3af',
  }
  return m[r.toUpperCase()] || m[r] || '#374151'
}

// ── Shared types for customer+card autocomplete ───────────────────────────────
interface CustCard {
  id: string
  card_nickname?: string
  bank_name: string
  last4: string
  expiry?: string
  due_date?: string
  card_type?: string
}
interface CustResult {
  id: string
  name: string
  phone: string
  default_charge_pct: number
  outstanding_balance: number
  cards: CustCard[]
}

function cardLabel(c: CustCard) {
  const nick = c.card_nickname ? `${c.card_nickname} — ` : ''
  return `${nick}${c.bank_name} ...${c.last4}`
}

// ── CC Sheet helper (shared by InsertPanel and used after entry submit) ─────────
async function createCCSheetRow(transaction: Record<string, unknown>) {
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
    const ccRow = {
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
    }
    const { error } = await supabase.from('cc_sheet').insert(ccRow)
    if (error) console.error('[CC Sheet] insert error:', error.message)
    else console.log('[CC Sheet] row created for SR:', transaction.sr_no)
  } catch (err) {
    console.error('[CC Sheet] auto-generation error:', err)
  }
}

// ── Chamunda Sheet helper ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createChamundaSheetRow(transaction: any) {
  try {
    const date = transaction.date
    await supabase.rpc('initialize_chamunda_sheet', { p_date: date })

    const commPct  = Number(transaction.commission_pct) || 0
    const commType = transaction.commission_type || 'Inclusive'
    let commStr = `TRF ${commPct}`
    if (commType === 'Exclusive') commStr = `CH ${commPct}`
    if (commType === 'Deferred')  commStr = 'PAY PURU'

    const { data, error } = await supabase.from('chamunda_sheet').insert({
      date,
      row_type: 'transaction',
      transaction_id: transaction.id || null,
      name: transaction.customer_name || '',
      bank_charge_pct: 3.00,
      paid_amount: Number(transaction.paid_amount) || 0,
      swap_amount: Number(transaction.swap_amount)  || 0,
      commission_pct: commPct,
      commission_type: commStr,
      machine_name: transaction.swap_name || '',
      sort_order: Date.now(),
    }).select()

    if (error) {
      console.error('❌ Chamunda insert failed:', error.message, error.details)
      return
    }
    console.log('✅ Chamunda row created:', data)
    await supabase.rpc('recalculate_chamunda_totals', { p_date: date })
  } catch (err: unknown) {
    console.error('❌ createChamundaSheetRow exception:', err)
  }
}

// ── Insert Panel ───────────────────────────────────────────────────────────────
function InsertPanel({ onClose, onInserted }: { onClose:()=>void; onInserted:()=>void }) {
  const DEFAULT_COMM = 2.2
  const [form, setForm] = useState({
    customerName:'', bankCard:'', commPct: String(DEFAULT_COMM),
    totalAmount:'', paidAmount:'', accountNames:[] as string[],
    swapAmount:'', swapNames:[] as string[], difference:'', remarks:'PAID',
  })
  const [commType, setCommType] = useState('Inclusive')
  const [commAutoSource, setCommAutoSource] = useState<string|null>(null)
  const [nextSr, setNextSr] = useState(6752)
  const [submitting, setSubmitting] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)
  const [swapInput, setSwapInput] = useState('')
  const [acctInput, setAcctInput] = useState('')
  const acctRef = useRef<HTMLDivElement>(null)
  const [machineNames, setMachineNames] = useState<string[]>(SWAP_SUGGESTIONS)

  // Customer autocomplete
  const [custSearch, setCustSearch] = useState('')
  const [custSuggestions, setCustSuggestions] = useState<CustResult[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustResult|null>(null)
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [customerCards, setCustomerCards] = useState<CustCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [customCard, setCustomCard] = useState(false)
  const custRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('transactions').select('sr_no').order('sr_no',{ascending:false}).limit(1).then(({data})=>{
      if (data?.length) setNextSr((data[0].sr_no as number)+1)
    })
    supabase.from('swipe_machines').select('machine_name').eq('status','Active').then(({data})=>{
      if (data && data.length > 0) setMachineNames(data.map((m:{machine_name:string})=>m.machine_name))
    })
  },[])

  // Customer search debounced
  useEffect(()=>{
    if(custSearch.length < 2){ setCustSuggestions([]); return }
    const t=setTimeout(async()=>{
      const {data}=await supabase
        .from('customers')
        .select('id,name,phone,default_charge_pct,outstanding_balance,cards(id,card_nickname,bank_name,last4,expiry,due_date,card_type)')
        .ilike('name',`%${custSearch}%`)
        .limit(10)
      setCustSuggestions((data as CustResult[])||[])
    },300)
    return ()=>clearTimeout(t)
  },[custSearch])

  // Close cust dropdown on outside click
  useEffect(()=>{
    function h(e:MouseEvent){ if(custRef.current&&!custRef.current.contains(e.target as Node)) setShowCustDrop(false) }
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[])

  async function selectCustomer(c: CustResult){
    setSelectedCustomer(c)
    setCustSearch(c.name)
    setShowCustDrop(false)
    setForm(f=>({...f, customerName:c.name, bankCard:''}))
    setSelectedCardId('')
    setCustomCard(false)
    setForm(f=>({...f, commPct:String(c.default_charge_pct||DEFAULT_COMM)}))

    // Use cards from join, fallback to separate fetch
    let cards: CustCard[] = c.cards||[]
    if(cards.length===0){
      const {data}=await supabase.from('cards').select('id,card_nickname,bank_name,last4,expiry,due_date,card_type').eq('customer_id',c.id)
      cards=(data as CustCard[])||[]
    }
    console.log('[insert panel] cards:', cards)
    setCustomerCards(cards)

    // Auto-fill reminder
    const cardWithDue = cards.find(card => card.due_date)
    if (cardWithDue && cardWithDue.due_date) {
      setReminderDate(cardWithDue.due_date)
      setReminderType('card_due')
    } else {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      setReminderDate(d.toISOString().split('T')[0])
      setReminderType('payment')
    }
  }

  // Auto-calc amounts
  useEffect(()=>{
    const total=parseFloat(form.totalAmount); const comm=parseFloat(form.commPct)||DEFAULT_COMM
    if(!total||isNaN(total)) return
    const commAmt=Math.round(total*comm/100)
    const swap=commType==='Inclusive'?total+commAmt:total
    setForm(f=>({...f, paidAmount:total.toString(), swapAmount:Math.round(swap).toString()}))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[form.totalAmount, form.commPct, commType])

  async function toggleAcct(opt:string){
    const next=form.accountNames.includes(opt)?form.accountNames.filter(a=>a!==opt):[...form.accountNames,opt]
    setForm(f=>({...f,accountNames:next}))
    if(next.length>0){
      const firstAcct=next[0].split(' ')[0]
      const {data}=await supabase.from('bank_account_master').select('commission_pct,commission_type,account_name').ilike('account_name',`%${firstAcct}%`).limit(1)
      if(data&&data.length>0&&Number(data[0].commission_pct)>0){
        setForm(f=>({...f,commPct:String(data[0].commission_pct)}))
        if(data[0].commission_type) setCommType(data[0].commission_type as string)
        setCommAutoSource(data[0].account_name as string)
      }
    } else {
      setCommAutoSource(null)
    }
  }
  function addSwap(v?:string){const val=(v??swapInput).trim(); if(val&&!form.swapNames.includes(val)) setForm(f=>({...f,swapNames:[...f.swapNames,val]})); setSwapInput('')}

  const [insertError, setInsertError] = useState<string|null>(null)

  // Reminder state
  const [showReminder, setShowReminder] = useState(false)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [reminderType, setReminderType] = useState('payment')
  const [reminderNotes, setReminderNotes] = useState('')

  async function handleInsert(){
    if(!form.customerName){ setInsertError('Customer name is required'); return }
    if(!form.totalAmount){  setInsertError('Total amount is required');   return }
    setInsertError(null)
    setSubmitting(true)
    const today=new Date().toISOString().split('T')[0]
    const comm=parseFloat(form.commPct)||DEFAULT_COMM
    const total=parseFloat(form.totalAmount)||0
    const payload={
      date:today,
      customer_name:form.customerName.trim(),
      bank_card:form.bankCard.trim()||'',
      total_amount:total,
      paid_amount:parseFloat(form.paidAmount)||0,
      account_name:form.accountNames.join('+'),
      swap_amount:parseFloat(form.swapAmount)||0,
      swap_name:form.swapNames.join('+'),
      difference:form.difference?parseFloat(form.difference):null,
      remarks:form.remarks,
      status:{PAID:'Paid',PEND:'Pending',PURU:'Puru',UNPAID:'Unpaid',SE:'Paid',CANCEL:'Cancelled'}[form.remarks]||'Pending',
      commission_pct:comm,
      commission_amount:commType==='Deferred'?0:Math.round(total*comm/100),
      commission_type:commType,
    }
    console.log('[insert row] payload:', payload)
    const {data,error}=await supabase.from('transactions').insert(payload).select().single()
    console.log('[insert row] result:', data, error)
    if(error){
      setInsertError(error.message)
    } else {
      if(data) {
        const d = data as Record<string,unknown>
        createCCSheetRow(d)
        createCustomerSheetRow({...d, customer_id: selectedCustomer?.id || null})
        createChamundaSheetRow(d)
        saveTransactionToStorage(d).catch(() => {})
        logAction({
          action: 'Transaction Created',
          module: 'Daily Register',
          details: {
            sr_no: d.sr_no,
            customer_name: d.customer_name,
            bank_card: d.bank_card,
            total_amount: d.total_amount,
            paid_amount: d.paid_amount,
            account_name: d.account_name,
            swap_amount: d.swap_amount,
            swap_name: d.swap_name,
            remarks: d.remarks,
            commission_pct: d.commission_pct,
            date: d.date,
          },
        })

        if (showReminder && reminderDate) {
          const titleMap: Record<string, string> = {
            payment: `Collect payment — ${form.customerName}`,
            card_due: `Card due — ${form.customerName}`,
            follow_up: `Follow up — ${form.customerName}`,
            custom: `Reminder — ${form.customerName}`,
          }
          await supabase.from('reminders').insert({
            title: titleMap[reminderType] || `Reminder — ${form.customerName}`,
            description: reminderNotes || `Entry SR #${d.sr_no} — ₹${form.totalAmount}`,
            reminder_date: reminderDate,
            reminder_time: reminderTime || '09:00:00',
            type: reminderType,
            customer_id: selectedCustomer?.id || null,
            customer_name: form.customerName || '',
            bank_name: form.bankCard || '',
            amount: parseFloat(form.totalAmount) || 0,
            status: 'pending',
            phone: selectedCustomer?.phone || '',
          })
        }
      }
      onInserted()
      onClose()
    }
    setSubmitting(false)
  }

  const inCls='w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]'
  const lbCls='block text-[11px] font-medium text-[#374151] mb-0.5'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}/>
      <div className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col" style={{width:430,boxShadow:'-4px 0 20px rgba(0,0,0,0.12)'}}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
          <h2 className="font-semibold text-sm text-[#1a1a1a]">Insert Row — SR #{nextSr}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280"/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
          {/* Customer Name autocomplete */}
          <div ref={custRef} className="relative">
            <label className={lbCls}>Customer Name *</label>
            <div className="flex items-center gap-1.5 rounded border px-2.5 py-1.5" style={{borderColor:'#e5e7eb'}}>
              <Search size={11} color="#9ca3af"/>
              <input
                className="flex-1 text-xs outline-none bg-transparent"
                placeholder="Search customer..."
                value={custSearch}
                onChange={e=>{setCustSearch(e.target.value);setForm(f=>({...f,customerName:e.target.value}));setShowCustDrop(true);if(!e.target.value){setSelectedCustomer(null);setCustomerCards([]);setSelectedCardId('')}}}
                onFocus={()=>custSearch.length>=2&&setShowCustDrop(true)}
              />
            </div>
            {showCustDrop&&custSuggestions.length>0&&(
              <div className="absolute z-30 w-full bg-white border rounded-md shadow-lg mt-0.5" style={{borderColor:'#e5e7eb'}}>
                {custSuggestions.map(c=>(
                  <button key={c.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 border-b border-[#f3f4f6] last:border-0" onMouseDown={()=>selectCustomer(c)}>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] text-[#6b7280]">{c.phone} — {c.default_charge_pct}% commission</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer info card */}
          {selectedCustomer&&(
            <div className="rounded-lg p-2.5 text-xs" style={{border:'1px solid #3ECF8E',background:'#f0fdf4'}}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#1a1a1a]">{selectedCustomer.name}</span>
                <span className="text-[10px] text-[#6b7280]">{selectedCustomer.phone}</span>
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-[#6b7280]">
                <span>Outstanding: <strong className="text-[#1a1a1a]">₹{selectedCustomer.outstanding_balance.toLocaleString('en-IN')}</strong></span>
                <span>Commission: <strong className="text-[#1a1a1a]">{selectedCustomer.default_charge_pct}%</strong></span>
              </div>
              {customerCards.length>0&&(
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {customerCards.map(c=>(
                    <button key={c.id} type="button" onClick={()=>{setSelectedCardId(c.id);setForm(f=>({...f,bankCard:c.bank_name}));setCustomCard(false)}}
                      className="px-1.5 py-0.5 rounded-full text-[10px] border"
                      style={{background:selectedCardId===c.id?'#3ECF8E':'#fff',color:selectedCardId===c.id?'#fff':'#374151',borderColor:selectedCardId===c.id?'#3ECF8E':'#d1d5db'}}
                    >
                      {cardLabel(c)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bank Card */}
          <div>
            <label className={lbCls}>Bank Card</label>
            {customerCards.length>0&&!customCard?(
              <div className="flex gap-1.5">
                <select className={`${inCls} flex-1 bg-white`} style={{borderColor:'#e5e7eb'}} value={selectedCardId}
                  onChange={e=>{
                    if(e.target.value==='__other__'){setCustomCard(true);setSelectedCardId('');setForm(f=>({...f,bankCard:''}));return}
                    const card=customerCards.find(c=>c.id===e.target.value)
                    if(card){setSelectedCardId(card.id);setForm(f=>({...f,bankCard:card.bank_name}))}
                  }}
                >
                  <option value="">Select card...</option>
                  {customerCards.map(c=><option key={c.id} value={c.id}>{cardLabel(c)}</option>)}
                  <option value="__other__">Other (type manually)</option>
                </select>
              </div>
            ):(
              <div className="flex gap-1.5">
                <input className={`${inCls} flex-1`} style={{borderColor:'#e5e7eb'}} placeholder="HDFC, AXIS, RBL..." value={form.bankCard} onChange={e=>setForm(f=>({...f,bankCard:e.target.value}))} autoFocus={customCard}/>
                {customCard&&<button type="button" className="text-[10px] text-[#6b7280] underline whitespace-nowrap" onClick={()=>{setCustomCard(false);setForm(f=>({...f,bankCard:''}));setSelectedCardId('')}}>← back</button>}
              </div>
            )}
          </div>

          {/* Commission + Amounts */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbCls}>
                Commission %
                {commAutoSource&&<span className="ml-1 font-normal" style={{color:'#3ECF8E',fontSize:10}}>auto-filled</span>}
              </label>
              <input type="number" step="0.01" className={inCls} style={{borderColor:'#e5e7eb'}} value={form.commPct} onChange={e=>{setForm(f=>({...f,commPct:e.target.value}));setCommAutoSource(null)}}/>
            </div>
            <div>
              <label className={lbCls}>
                Comm Type
                {commAutoSource&&<span className="ml-1 font-normal" style={{color:'#3ECF8E',fontSize:10}}>auto-filled</span>}
              </label>
              <select className={`${inCls} bg-white`} style={{borderColor:'#e5e7eb'}} value={commType} onChange={e=>setCommType(e.target.value)}>
                <option value="Inclusive">Inclusive</option>
                <option value="Exclusive">Exclusive</option>
                <option value="Deferred">Deferred</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={lbCls}>Total Amount *</label><input type="number" className={inCls} style={{borderColor:'#e5e7eb'}} value={form.totalAmount} onChange={e=>setForm(f=>({...f,totalAmount:e.target.value}))}/></div>
            <div><label className={lbCls}>Paid Amount</label><input type="number" className={inCls} style={{borderColor:'#e5e7eb'}} value={form.paidAmount} onChange={e=>setForm(f=>({...f,paidAmount:e.target.value}))}/></div>
            <div><label className={lbCls}>Swap Amount</label><input type="number" className={inCls} style={{borderColor:'#e5e7eb'}} value={form.swapAmount} onChange={e=>setForm(f=>({...f,swapAmount:e.target.value}))}/></div>
          </div>
          {/* Account Name */}
          <div ref={acctRef}>
            <label className={lbCls}>A/C Name</label>
            <div className="min-h-[30px] rounded border px-2 py-1 cursor-pointer flex flex-wrap gap-1 items-center text-xs" style={{borderColor:'#e5e7eb'}} onClick={()=>setAcctOpen(o=>!o)}>
              {form.accountNames.map(a=>(
                <span key={a} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{background:'#d1fae5',color:'#065f46'}}>
                  {a}<button type="button" onClick={e=>{e.stopPropagation();toggleAcct(a)}}><X size={8}/></button>
                </span>
              ))}
              {form.accountNames.length===0&&<span className="text-[#9ca3af]">Select accounts...</span>}
            </div>
            {acctOpen&&(
              <div className="bg-white border rounded-md shadow-md mt-1 p-2 z-10 relative" style={{borderColor:'#e5e7eb'}}>
                <div className="flex flex-wrap gap-1 mb-2 max-h-28 overflow-y-auto">
                  {ACCOUNT_OPTIONS.map(opt=>(
                    <button key={opt} type="button" onClick={()=>toggleAcct(opt)} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border" style={{background:form.accountNames.includes(opt)?'#3ECF8E':'#f3f4f6',color:form.accountNames.includes(opt)?'#fff':'#374151',borderColor:form.accountNames.includes(opt)?'#3ECF8E':'#e5e7eb'}}>{opt}</button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input className="flex-1 border rounded px-2 py-1 text-[10px] outline-none" style={{borderColor:'#e5e7eb'}} placeholder="Custom..." value={acctInput} onChange={e=>setAcctInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const v=acctInput.trim();if(v){toggleAcct(v)};setAcctInput('')}}}/>
                  <button type="button" className="px-2 py-1 rounded text-[10px] font-medium text-white" style={{background:'#3ECF8E'}} onClick={()=>{const v=acctInput.trim();if(v)toggleAcct(v);setAcctInput('')}}>Add</button>
                </div>
              </div>
            )}
          </div>
          {/* Swap Name */}
          <div>
            <label className={lbCls}>Swap Name</label>
            <div className="min-h-[30px] rounded border px-2 py-1 flex flex-wrap gap-1 items-center" style={{borderColor:'#e5e7eb'}}>
              {form.swapNames.map(s=>(
                <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{background:'#dbeafe',color:'#1e40af'}}>
                  {s}<button type="button" onClick={()=>setForm(f=>({...f,swapNames:f.swapNames.filter(n=>n!==s)}))}><X size={8}/></button>
                </span>
              ))}
              <input className="flex-1 min-w-[80px] text-xs outline-none bg-transparent" placeholder="Type + Enter..." value={swapInput} onChange={e=>setSwapInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key===','||e.key==='+'){e.preventDefault();addSwap()}}}/>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {machineNames.filter(s=>!form.swapNames.includes(s)).slice(0,10).map(s=>(
                <button key={s} type="button" onMouseDown={()=>addSwap(s)} className="px-1.5 py-0.5 rounded-full text-[10px] border hover:bg-[#3ECF8E] hover:text-white" style={{background:'#f3f4f6',borderColor:'#e5e7eb'}}>{s}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbCls}>Difference</label><input type="number" className={inCls} style={{borderColor:'#e5e7eb'}} value={form.difference} onChange={e=>setForm(f=>({...f,difference:e.target.value}))}/></div>
            <div><label className={lbCls}>Remarks</label>
              <select className={`${inCls} bg-white`} style={{borderColor:'#e5e7eb'}} value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))}>
                {REMARKS_OPTS.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Reminder section */}
          <div>
            <div
              onClick={() => setShowReminder(!showReminder)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                cursor: 'pointer', padding: '8px 0',
                color: '#3ECF8E', fontSize: '12px', fontWeight: '500',
                borderTop: '1px solid #e5e7eb', marginTop: '4px',
              }}
            >
              <Bell size={14} />
              {showReminder ? '− Remove Reminder' : '+ Add Reminder for this entry'}
            </div>

            {showReminder && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: '8px', padding: '10px', marginBottom: '8px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', marginBottom: '8px' }}>
                  🔔 Set Reminder
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: '#6b7280' }}>Reminder Date</label>
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={e => setReminderDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '5px', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#6b7280' }}>Time</label>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={e => setReminderTime(e.target.value)}
                      style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '5px', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '6px' }}>
                  <label style={{ fontSize: '10px', color: '#6b7280' }}>Reminder Type</label>
                  <select
                    value={reminderType}
                    onChange={e => setReminderType(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '5px', padding: '4px 6px', fontSize: '11px' }}
                  >
                    <option value="payment">💰 Payment Collection</option>
                    <option value="follow_up">📞 Follow Up</option>
                    <option value="card_due">💳 Card Due</option>
                    <option value="custom">⭐ Custom</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: '#6b7280' }}>Notes (optional)</label>
                  <input
                    type="text"
                    value={reminderNotes}
                    onChange={e => setReminderNotes(e.target.value)}
                    placeholder="e.g. Collect commission, Follow up on payment..."
                    style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '5px', padding: '4px 6px', fontSize: '11px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: '+3 Days', days: 3 },
                    { label: '+7 Days', days: 7 },
                    { label: '+15 Days', days: 15 },
                  ].map(({ label, days }) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + days)
                        setReminderDate(d.toISOString().split('T')[0])
                      }}
                      style={{
                        background: 'white', border: '1px solid #86efac',
                        borderRadius: '4px', padding: '2px 6px',
                        fontSize: '10px', cursor: 'pointer', color: '#166534',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {insertError&&<div className="mx-4 mb-2 text-xs px-3 py-2 rounded bg-red-50 text-red-700 border border-red-200">{insertError}</div>}
        <div className="px-4 py-3 border-t border-[#e5e7eb] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border text-xs font-medium text-[#374151]" style={{borderColor:'#e5e7eb'}}>Cancel</button>
          <button onClick={handleInsert} disabled={submitting} className="flex-1 py-2 rounded text-xs font-medium text-white disabled:opacity-60 flex items-center justify-center gap-1.5" style={{background:'#3ECF8E'}}>
            {submitting&&<span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"/>}
            {submitting?'Saving...':'Insert Row'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Custom Sheet View — matches daily_register format ─────────────────────────
// CS_HDR background is applied dynamically per-sheet using themeColor
const CS_HDR_BASE: Omit<React.CSSProperties, 'background'> = {
  border: '1px solid #000', padding: '3px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif',
  color: '#000', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
}
const CS_CELL: React.CSSProperties = {
  border: '1px solid #000', padding: '3px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#fff',
  color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  verticalAlign: 'middle', cursor: 'text', textAlign: 'center',
}

function CustomSheetView({ sheet }: { sheet: { id: string; label: string; themeColor: string; columns: { key: string; label: string }[] } }) {
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [activeMonth, setActiveMonth] = React.useState<string>('all')
  const [editCell, setEditCell] = React.useState<{ rowId: string; colKey: string; val: string } | null>(null)
  const [flashCells, setFlashCells] = React.useState<Set<string>>(new Set())
  const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const editRef = React.useRef<HTMLInputElement>(null)
  const colMapRef = React.useRef<Record<string, string>>({})  // colKey → txField
  const txFieldsRef = React.useRef<string[]>([])

  // Numeric tx fields — formatted with commas
  const NUMBER_FIELDS = new Set(['total_amount','paid_amount','swap_amount','difference','commission_pct','commission_amount'])
  const DATE_FIELDS = new Set(['date'])

  function fmt(val: unknown, txField: string): string {
    if (val == null || val === '') return ''
    if (NUMBER_FIELDS.has(txField)) return Number(val).toLocaleString('en-IN')
    if (DATE_FIELDS.has(txField)) {
      const d = new Date(String(val))
      return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(2)}`
    }
    return String(val)
  }

  const loadRows = React.useCallback(async () => {
    if (txFieldsRef.current.length === 0) return
    const selectStr = ['id', 'sr_no', 'date', ...txFieldsRef.current].join(', ')
    const { data } = await supabase.from('transactions').select(selectStr).order('sr_no', { ascending: true })
    if (!data) return
    setRows((data as unknown as Record<string, unknown>[]).map((tx) => {
      const row: Record<string, unknown> = { _id: tx.id, _sr: tx.sr_no, _date: tx.date }
      sheet.columns.forEach(col => {
        const f = colMapRef.current[col.key]
        row[col.key] = f ? tx[f] : undefined
        row[`_txf_${col.key}`] = f  // store tx field name for formatting
      })
      return row
    }))
  }, [sheet.columns])

  // Init: load mapping rules then rows
  React.useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      const { data: rules } = await supabase
        .from('field_mapping_rules').select('form_field_id, column_id').eq('sheet_id', sheet.id)
      if (cancelled) return
      if (!rules || rules.length === 0) { setLoading(false); return }
      const colMap: Record<string, string> = {}
      rules.forEach((r: { form_field_id: string; column_id: string }) => { colMap[r.column_id] = r.form_field_id })
      colMapRef.current = colMap
      txFieldsRef.current = Array.from(new Set(rules.map((r: { form_field_id: string }) => r.form_field_id)))
      await loadRows()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [sheet.id, sheet.columns, loadRows])

  // Realtime
  React.useEffect(() => {
    const ch = supabase.channel(`csv_${sheet.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, loadRows)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sheet.id, loadRows])

  // Month tabs from data
  const monthTabs = React.useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach(r => {
      const d = new Date(String(r._date ?? ''))
      if (isNaN(d.getTime())) return
      const key = `${d.getFullYear()}-${d.getMonth()+1}`
      if (!map.has(key)) map.set(key, d.toLocaleString('en-IN',{month:'long'}).toUpperCase()+' '+d.getFullYear())
    })
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b))
  }, [rows])

  // Filter + search
  const filtered = React.useMemo(() => {
    let r = rows
    if (activeMonth !== 'all') {
      const [y, m] = activeMonth.split('-').map(Number)
      r = r.filter(row => { const d = new Date(String(row._date??'')); return d.getFullYear()===y && d.getMonth()+1===m })
    }
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(row => sheet.columns.some(col => String(row[col.key]??'').toLowerCase().includes(q)))
    }
    return r
  }, [rows, activeMonth, search, sheet.columns])

  function showToast(msg: string, type: 'success'|'error' = 'success') {
    setToast({msg,type}); setTimeout(()=>setToast(null),3000)
  }

  function startEdit(rowId: string, colKey: string, val: unknown) {
    setEditCell({ rowId, colKey, val: val != null ? String(val) : '' })
    setTimeout(() => editRef.current?.focus(), 20)
  }

  async function commitEdit() {
    if (!editCell) return
    const { rowId, colKey, val } = editCell
    setEditCell(null)
    const txField = colMapRef.current[colKey]
    if (!txField) return
    const parsed = NUMBER_FIELDS.has(txField) ? (val === '' ? null : parseFloat(val) || 0) : val
    const { error } = await supabase.from('transactions').update({ [txField]: parsed }).eq('id', rowId)
    if (error) { showToast('Update failed: ' + error.message, 'error'); return }
    setRows(prev => prev.map(r => r._id === rowId ? { ...r, [colKey]: parsed } : r))
    const key = `${rowId}__${colKey}`
    setFlashCells(s => { const n = new Set(s); n.add(key); return n })
    setTimeout(() => setFlashCells(s => { const n = new Set(s); n.delete(key); return n }), 700)
    showToast('Saved')
  }

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(sheet.label)

    type Fill   = import('exceljs').Fill
    type Border = import('exceljs').Borders

    // Convert hex color (#RRGGBB) to ExcelJS ARGB (FFRRGGBB)
    const hexToArgb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase().padEnd(6, '0')
    const themeArgb = hexToArgb(sheet.themeColor)

    const themeFill: Fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: themeArgb } }
    const whiteFill: Fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    const borderStyle: Partial<Border> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    }
    const centerAll = { horizontal: 'center' as const, vertical: 'middle' as const }
    const totalCols = sheet.columns.length + 2 // col A (#) + data cols + 1 buffer

    // Column widths
    ws.columns = [
      { key: '_sr', width: 6 },
      ...sheet.columns.map(c => ({ key: c.key, width: 20 })),
    ]

    // ── DATE header row (merged across all data columns) ──
    const today = new Date()
    const dateStr = `${today.getDate()}/${today.getMonth()+1}/${String(today.getFullYear()).slice(2)}`
    const activeMonthLabel = filtered.length > 0 ? (() => {
      const d = new Date(String(filtered[0]._date ?? ''))
      return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN',{month:'long'}).toUpperCase()+' '+d.getFullYear()
    })() : ''

    const titleRow = ws.addRow({})
    titleRow.height = 20
    ws.mergeCells(titleRow.number, 1, titleRow.number, totalCols - 1)
    const titleCell = ws.getCell(titleRow.number, 1)
    titleCell.value = `${sheet.label.toUpperCase()}${activeMonthLabel ? ' — ' + activeMonthLabel : ''}   DATE: ${dateStr}`
    titleCell.fill = themeFill
    titleCell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: 'FF000000' } }
    titleCell.alignment = centerAll
    titleCell.border = borderStyle
    for (let c = 1; c < totalCols; c++) ws.getCell(titleRow.number, c).border = borderStyle

    // ── Column headers row ──
    const hRow = ws.addRow({})
    hRow.height = 18
    hRow.getCell(1).value = '#'
    sheet.columns.forEach((col, i) => { hRow.getCell(i + 2).value = col.label })
    hRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > totalCols - 1) return
      cell.fill = themeFill
      cell.font = { bold: true, size: 11, name: 'Calibri' }
      cell.alignment = centerAll
      cell.border = borderStyle
    })

    // ── Data rows ──
    filtered.forEach((row, i) => {
      const dr = ws.addRow({})
      dr.height = 16
      dr.getCell(1).value = i + 1
      sheet.columns.forEach((col, ci) => {
        const f = colMapRef.current[col.key]
        const v = row[col.key]
        let cellVal: string | number | Date | null = null
        if (v != null && v !== '') {
          if (NUMBER_FIELDS.has(f)) cellVal = Number(v)
          else if (DATE_FIELDS.has(f)) cellVal = new Date(String(v))
          else cellVal = String(v)
        }
        const cell = dr.getCell(ci + 2)
        cell.value = cellVal
        if (NUMBER_FIELDS.has(f) && cellVal !== null) cell.numFmt = '#,##0'
        if (DATE_FIELDS.has(f) && cellVal instanceof Date) cell.numFmt = 'dd/mm/yy'
      })
      dr.fill = whiteFill
      dr.font = { name: 'Calibri', size: 11 }
      dr.alignment = centerAll
      dr.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum > totalCols - 1) return
        cell.border = borderStyle
        cell.fill = cell.fill ?? whiteFill
      })
    })

    // ── Freeze header rows and hide columns past the table ──
    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }]
    for (let c = totalCols; c <= 50; c++) {
      const col = ws.getColumn(c)
      col.width = 0.1
      col.hidden = true
      ws.eachRow(row => {
        const cell = row.getCell(c)
        cell.value = null
        cell.fill = { type: 'pattern', pattern: 'none' } as Fill
        cell.border = {}
        cell.font = {}
      })
    }
    ws.pageSetup = { printArea: `A1:${String.fromCharCode(64 + totalCols - 1)}1000` }

    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `${sheet.label}_${new Date().toISOString().split('T')[0]}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (sheet.columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-12">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{background:'#f0fdf4'}}><Table2 size={26} color="#3ECF8E"/></div>
        <div>
          <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">{sheet.label}</h3>
          <p className="text-xs text-[#6b7280]">No columns defined yet.</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">Go to <strong>Field Mapping</strong> to add columns to this sheet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {toast && <div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type==='success'?'bg-[#3ECF8E]':'bg-red-500'}`}>{toast.msg}</div>}

      {/* Month tabs */}
      {monthTabs.length > 0 && (
        <div className="flex items-center gap-0 border-b border-[#e5e7eb] bg-[#f9fafb] overflow-x-auto flex-shrink-0">
          <button onClick={()=>setActiveMonth('all')}
            className="px-3 py-1.5 text-xs font-medium whitespace-nowrap border-r border-[#e5e7eb]"
            style={{background:activeMonth==='all'?'#fff':'transparent',borderBottom:activeMonth==='all'?'2px solid #3ECF8E':'2px solid transparent',color:activeMonth==='all'?'#1a1a1a':'#6b7280'}}>
            ALL
          </button>
          {monthTabs.map(([key,label])=>(
            <button key={key} onClick={()=>setActiveMonth(key)}
              className="px-3 py-1.5 text-xs font-medium whitespace-nowrap border-r border-[#e5e7eb]"
              style={{background:activeMonth===key?'#fff':'transparent',borderBottom:activeMonth===key?'2px solid #3ECF8E':'2px solid transparent',color:activeMonth===key?'#1a1a1a':'#6b7280'}}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        <span className="text-xs text-[#6b7280]">{filtered.length} rows</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded border text-xs" style={{borderColor:'#e5e7eb'}}>
            <Search size={11} color="#9ca3af"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="outline-none text-xs w-28" style={{fontFamily:'inherit'}}/>
            {search && <button onClick={()=>setSearch('')}><X size={10} color="#9ca3af"/></button>}
          </div>
          <button onClick={()=>loadRows()} className="p-1.5 rounded border hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}><RefreshCw size={12} color="#6b7280"/></button>
          <button onClick={exportXlsx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium text-[#374151] hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>
            <Download size={12}/> Export .xlsx
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" style={{fontFamily:'Calibri,Arial,sans-serif'}}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
        ) : (
          <table style={{borderCollapse:'collapse',tableLayout:'auto',minWidth:sheet.columns.length*140+48}}>
            <thead>
              <tr>
                <td colSpan={sheet.columns.length + 1}
                  style={{background:sheet.themeColor,border:'1px solid #000',padding:'4px 8px',fontFamily:'Calibri,Arial,sans-serif',fontSize:12,fontWeight:'bold',textAlign:'center',color:'#000'}}>
                  {sheet.label.toUpperCase()} — DATE: {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'})}
                </td>
              </tr>
              <tr>
                <th style={{...CS_HDR_BASE,background:sheet.themeColor,width:48}}>#</th>
                {sheet.columns.map(col => <th key={col.key} style={{...CS_HDR_BASE,background:sheet.themeColor,minWidth:130}}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={sheet.columns.length+1} style={{...CS_CELL,textAlign:'center',padding:'24px',color:'#9ca3af'}}>
                  No entries yet — submit a transaction from <strong>New Entry</strong> to populate this sheet.
                </td></tr>
              ) : filtered.map((row, i) => (
                <tr key={String(row._id??i)} style={{background: i%2===0?'#fff':'#f9fafb'}}>
                  <td style={{...CS_CELL,textAlign:'center',color:'#9ca3af',width:48,cursor:'default'}}>{i+1}</td>
                  {sheet.columns.map(col => {
                    const isEditing = editCell?.rowId===String(row._id) && editCell.colKey===col.key
                    const flash = flashCells.has(`${row._id}__${col.key}`)
                    const txField = colMapRef.current[col.key] ?? ''
                    const display = fmt(row[col.key], txField)
                    return (
                      <td key={col.key} style={{...CS_CELL,textAlign:'center',background:flash?'#bbf7d0':i%2===0?'#fff':'#f9fafb',transition:'background 0.4s',minWidth:130}}
                        onClick={()=>startEdit(String(row._id), col.key, row[col.key])}>
                        {isEditing ? (
                          <input ref={editRef} value={editCell!.val}
                            onChange={e=>setEditCell(c=>c?{...c,val:e.target.value}:null)}
                            onBlur={commitEdit}
                            onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditCell(null)}}
                            style={{width:'100%',border:'none',outline:`2px solid ${sheet.themeColor}`,padding:'2px 4px',fontSize:12,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box',textAlign:'center'}}/>
                        ) : display ? display : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Coming Soon placeholder ────────────────────────────────────────────────────
function ComingSoon({name, isCustom}:{name:string; isCustom?: boolean}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{background: isCustom ? '#f0fdf4' : '#f3f4f6'}}>
        <Table2 size={28} color={isCustom ? '#3ECF8E' : '#9ca3af'}/>
      </div>
      <div>
        <h3 className="text-base font-semibold text-[#1a1a1a] mb-1">{name}</h3>
        {isCustom ? (
          <>
            <p className="text-sm text-[#6b7280]">Custom sheet</p>
            <p className="text-xs text-[#9ca3af] mt-1">This sheet was created in Field Mapping. A full data view is not yet available.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-[#6b7280]">Coming soon</p>
            <p className="text-xs text-[#9ca3af] mt-1">This sheet view is under development</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Customer Sheet helper ──────────────────────────────────────────────────────
async function createCustomerSheetRow(transaction: Record<string, unknown>) {
  try {
    let cardNumber = '', pin = '', cvvExpiry = '', dueDate: string | null = null, cardNetwork = ''
    const customerId = transaction.customer_id as string | null
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
    const paidAmt = Number(transaction.paid_amount) || 0
    const swapAmt = Number(transaction.swap_amount) || 0
    const commission = Number(transaction.commission_amount) || 0
    const { error } = await supabase.from('customer_sheet').insert({
      transaction_id: transaction.id || null,
      customer_id: customerId || null,
      customer_name: String(transaction.customer_name || ''),
      due_date: dueDate,
      card: bankCard,
      card_number: cardNumber,
      pin,
      cvv_expiry: cvvExpiry,
      total_amount: totalAmt,
      paid_amount: paidAmt,
      swap_amount: swapAmt,
      commission,
      paid_remaining: totalAmt - paidAmt,
      swap_pending: swapAmt - totalAmt,
      account_name: String(transaction.account_name || ''),
      swap_name: String(transaction.swap_name || ''),
      paid_date: transaction.remarks === 'PAID' ? String(transaction.date || '') : null,
      card_network: cardNetwork,
      date: String(transaction.date || new Date().toISOString().split('T')[0]),
    })
    if (error) console.error('[Customer Sheet] insert error:', error.message)
    else console.log('[Customer Sheet] row created for:', transaction.customer_name)
  } catch (err) {
    console.error('[Customer Sheet] auto-generation error:', err)
  }
}

// ── Customer Sheet types ───────────────────────────────────────────────────────
interface CustSheetRow {
  id: string
  transaction_id: string | null
  customer_id: string | null
  customer_name: string
  due_date: string | null
  card: string
  card_number: string
  pin: string
  cvv_expiry: string
  total_amount: number
  paid_amount: number
  swap_amount: number
  commission: number
  paid_remaining: number
  swap_pending: number
  account_name: string
  swap_name: string
  paid_date: string | null
  card_network: string
  date: string
}

const CS_HS: React.CSSProperties = { border:'1px solid #000', padding:'3px 6px', fontSize:12, fontFamily:'Calibri,Arial,sans-serif', background:'#92D050', color:'#000', fontWeight:'bold', textAlign:'center', whiteSpace:'nowrap' }
const CS_CS: React.CSSProperties = { border:'1px solid #000', padding:'3px 6px', fontSize:12, fontFamily:'Calibri,Arial,sans-serif', background:'#ffffff', color:'#000', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', verticalAlign:'middle', textAlign:'center' }
const CS_CW = { due_date:100, customer_name:150, card:80, card_number:170, pin:80, cvv_expiry:90, total_amount:110, paid_amount:110, swap_amount:110, commission:80, paid_remaining:130, swap_pending:120, account_name:150, swap_name:150, paid_date:110, card_network:120 }
const CS_W = Object.values(CS_CW).reduce((s,v)=>s+v,0)

const MONTH_NAMES = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']

function getMonthRange(rows: CustSheetRow[]): string {
  if(rows.length===0) return ''
  const months = rows.map(r=>{ const d=new Date(r.date); return {m:d.getMonth()+1,y:d.getFullYear()} })
  const first=months[0], last=months[months.length-1]
  if(first.m===last.m&&first.y===last.y) return `${MONTH_NAMES[first.m]} ${first.y}`
  return `${MONTH_NAMES[first.m]}-${MONTH_NAMES[last.m]}`
}

function fmtD(d: string|null) {
  if(!d) return ''
  const dt=new Date(d); return `${dt.getDate()}/${dt.getMonth()+1}/${String(dt.getFullYear()).slice(2)}`
}

// ── Customer Sheet View ────────────────────────────────────────────────────────
function CustomerSheetView() {
  type CustTab = { customer_name: string; customer_id: string | null; count: number }
  const [allRows, setAllRows] = useState<CustSheetRow[]>([])
  const [customers, setCustomers] = useState<CustTab[]>([])
  const [activeCustomer, setActiveCustomer] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showInsert, setShowInsert] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null)

  // Insert form state
  const [fCustName, setFCustName] = useState('')
  const [fCustId, setFCustId] = useState<string|null>(null)
  const [fCard, setFCard] = useState('')
  const [fCardNumber, setFCardNumber] = useState('')
  const [fPin, setFPin] = useState('')
  const [fCvvExpiry, setFCvvExpiry] = useState('')
  const [fDueDate, setFDueDate] = useState('')
  const [fCardNetwork, setFCardNetwork] = useState('')
  const [fTotalAmt, setFTotalAmt] = useState('')
  const [fPaidAmt, setFPaidAmt] = useState('')
  const [fSwapAmt, setFSwapAmt] = useState('')
  const [fCommission, setFCommission] = useState('')
  const [fAccountName, setFAccountName] = useState('')
  const [fSwapName, setFSwapName] = useState('')
  const [fPaidDate, setFPaidDate] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0])
  const [custSearch, setCustSearch] = useState('')
  const [custSuggs, setCustSuggs] = useState<{id:string;name:string;phone:string;cards:{id:string;bank_name:string;card_number:string;pin:string;cvv:string;expiry:string;due_date:string;card_type:string}[]}[]>([])
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [custCards, setCustCards] = useState<{id:string;bank_name:string;card_number:string;pin:string;cvv:string;expiry:string;due_date:string;card_type:string}[]>([])
  const custRef = useRef<HTMLDivElement>(null)

  const showToast = (msg:string,type:'success'|'error'='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const fetchAll = useCallback(async()=>{
    setLoading(true)
    const [{data: sheetData}, {data: custData}] = await Promise.all([
      supabase.from('customer_sheet').select('*').order('date',{ascending:true}),
      supabase.from('customers').select('id,name').order('name',{ascending:true}),
    ])
    const rows = (sheetData as CustSheetRow[])||[]
    setAllRows(rows)
    // Build map from existing sheet rows
    const map = new Map<string,CustTab>()
    rows.forEach(r=>{
      if(!map.has(r.customer_name)) map.set(r.customer_name,{customer_name:r.customer_name,customer_id:r.customer_id,count:0})
      map.get(r.customer_name)!.count++
    })
    // Add customers from customers table who have no sheet rows yet
    ;(custData as {id:string;name:string}[]||[]).forEach(c=>{
      if(!map.has(c.name)) map.set(c.name,{customer_name:c.name,customer_id:c.id,count:0})
    })
    const tabs=Array.from(map.values()).sort((a,b)=>a.customer_name.localeCompare(b.customer_name))
    setCustomers(tabs)
    if(tabs.length>0) setActiveCustomer(prev=>prev&&map.has(prev)?prev:tabs[0].customer_name)
    setLoading(false)
  },[])

  useEffect(()=>{ fetchAll() },[fetchAll])

  // Customer autocomplete
  useEffect(()=>{
    if(custSearch.length<2){ setCustSuggs([]); return }
    const t=setTimeout(async()=>{
      const {data}=await supabase.from('customers').select('id,name,phone,cards(id,bank_name,card_number,pin,cvv,expiry,due_date,card_type)').ilike('name',`%${custSearch}%`).limit(10)
      setCustSuggs((data as typeof custSuggs)||[])
      setShowCustDrop(true)
    },300)
    return ()=>clearTimeout(t)
  },[custSearch])

  useEffect(()=>{
    function h(e:MouseEvent){ if(custRef.current&&!custRef.current.contains(e.target as Node)) setShowCustDrop(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])

  function selectCard(bankName:string){
    setFCard(bankName)
    const c=custCards.find(x=>x.bank_name===bankName)
    if(c){
      setFCardNumber(c.card_number||'')
      setFPin(c.pin||'')
      setFCvvExpiry(c.cvv?`${c.cvv}/${c.expiry||''}`:c.expiry||'')
      setFDueDate(c.due_date||'')
      setFCardNetwork(c.card_type||'')
    }
  }

  function resetInsertForm(){
    setFCustName(''); setFCustId(null); setCustSearch(''); setFCard(''); setFCardNumber(''); setFPin(''); setFCvvExpiry(''); setFDueDate(''); setFCardNetwork(''); setFTotalAmt(''); setFPaidAmt(''); setFSwapAmt(''); setFCommission(''); setFAccountName(''); setFSwapName(''); setFPaidDate(''); setFDate(new Date().toISOString().split('T')[0]); setCustCards([])
  }

  async function handleInsert(){
    if(!fCustName||!fTotalAmt){ showToast('Customer name and total amount required','error'); return }
    setSubmitting(true)
    const totalAmt=parseFloat(fTotalAmt)||0
    const paidAmt=parseFloat(fPaidAmt)||0
    const swapAmt=parseFloat(fSwapAmt)||0
    const commission=parseFloat(fCommission)||0
    const {error}=await supabase.from('customer_sheet').insert({
      customer_id:fCustId||null, customer_name:fCustName.trim(),
      due_date:fDueDate||null, card:fCard, card_number:fCardNumber, pin:fPin, cvv_expiry:fCvvExpiry,
      total_amount:totalAmt, paid_amount:paidAmt, swap_amount:swapAmt, commission,
      paid_remaining:totalAmt-paidAmt, swap_pending:swapAmt-totalAmt,
      account_name:fAccountName, swap_name:fSwapName,
      paid_date:fPaidDate||null, card_network:fCardNetwork, date:fDate,
    })
    if(error) showToast('Insert failed: '+error.message,'error')
    else { showToast('Row added'); setShowInsert(false); resetInsertForm(); fetchAll() }
    setSubmitting(false)
  }

  async function exportCustomerXlsx(){
    const ExcelJS=(await import('exceljs')).default
    const wb=new ExcelJS.Workbook(); wb.creator='SwipeSaaS'; wb.created=new Date()
    const border={top:{style:'thin' as const,color:{argb:'FF000000'}},bottom:{style:'thin' as const,color:{argb:'FF000000'}},left:{style:'thin' as const,color:{argb:'FF000000'}},right:{style:'thin' as const,color:{argb:'FF000000'}}}
    const hdrCols=['DUE DATE','CM NAME','CARD','CARD NO','PIN','CVV/EXPRY','TOTAL AMT','PAID AMT','SWAP AMT','COM','PAID REMAINING','SWAP PENDING','A/C NAME','SWAP NAME','PAID DATE','VISA/MASTERCARD']
    const colWidths=[{width:12},{width:18},{width:10},{width:20},{width:10},{width:12},{width:14},{width:14},{width:14},{width:10},{width:16},{width:14},{width:18},{width:18},{width:14},{width:16}]
    const uniqueCusts=Array.from(new Map(allRows.map(r=>[r.customer_name,r])).keys())
    uniqueCusts.forEach(custName=>{
      const crows=allRows.filter(r=>r.customer_name===custName)
      const ws=wb.addWorksheet(custName.slice(0,31))
      ws.columns=colWidths
      const monthRange=getMonthRange(crows)
      // Title row — merged
      ws.mergeCells('A1:P1')
      const titleCell=ws.getCell('A1')
      titleCell.value=`${custName}//WITH COM//--${monthRange}`
      titleCell.font={bold:true,name:'Calibri',size:12}
      titleCell.alignment={horizontal:'center',vertical:'middle'}
      titleCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF92D050'}}
      titleCell.border=border
      ws.getRow(1).height=18
      // Header row
      const hRow=ws.addRow(hdrCols)
      hRow.eachCell(c=>{ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF92D050'}}; c.font={bold:true,name:'Calibri',size:11}; c.border=border; c.alignment={horizontal:'center',vertical:'middle'} })
      // Data rows
      crows.forEach((r,i)=>{
        const dr=ws.addRow([fmtD(r.due_date),r.customer_name,r.card,r.card_number,r.pin,r.cvv_expiry,Number(r.total_amount)||0,Number(r.paid_amount)||0,Number(r.swap_amount)||0,Number(r.commission)||0,Number(r.paid_remaining)||0,Number(r.swap_pending)||0,r.account_name,r.swap_name,fmtD(r.paid_date),r.card_network])
        const altBg=i%2===1?'FFE8F5E9':'FFFFFFFF'
        dr.eachCell({includeEmpty:true},(c,col)=>{
          c.fill={type:'pattern',pattern:'solid',fgColor:{argb:altBg}}; c.font={name:'Calibri',size:11}; c.border=border
          if(col>=7&&col<=12){ c.numFmt='#,##0.00'; c.alignment={horizontal:'right',vertical:'middle'} } else { c.alignment={horizontal:'center',vertical:'middle'} }
        })
      })
      if(crows.length===0){ const er=ws.addRow(['No data','','','','','','','','','','','','','','','']); er.eachCell({includeEmpty:true},c=>{ c.border=border; c.alignment={horizontal:'center',vertical:'middle'} }) }
    })
    const buf=await wb.xlsx.writeBuffer()
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url
    const today=new Date(); a.download=`CustomerSheet_${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),10000)
  }

  const activeRows=useMemo(()=>allRows.filter(r=>r.customer_name===activeCustomer),[allRows,activeCustomer])
  const monthRange=useMemo(()=>getMonthRange(activeRows),[activeRows])
  const csDateGroups=useMemo(()=>{
    const map=new Map<string,CustSheetRow[]>()
    activeRows.forEach(r=>{ const d=r.date||''; if(!map.has(d)) map.set(d,[]); map.get(d)!.push(r) })
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b))
  },[activeRows])
  const rowCountMap=useMemo(()=>{ const m=new Map<string,number>(); allRows.forEach(r=>m.set(r.customer_name,(m.get(r.customer_name)||0)+1)); return m },[allRows])
  const inp='w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]'
  const lb='block text-[11px] font-medium text-[#374151] mb-0.5'

  // ── Inline editing state ──
  const [editCell, setEditCell] = useState<{rowId:string;field:string}|null>(null)
  const [editVal, setEditVal] = useState<string>('')
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null) // rowId pending delete
  const editInputRef = useRef<HTMLInputElement>(null)

  function startEdit(rowId:string, field:string, currentVal:string|number|null) {
    setEditCell({rowId,field})
    setEditVal(currentVal!=null?String(currentVal):'')
  }

  async function commitEdit() {
    if(!editCell) return
    const {rowId,field} = editCell
    const row = allRows.find(r=>r.id===rowId)
    if(!row) { setEditCell(null); return }
    const origVal = String((row as unknown as Record<string,unknown>)[field]??'')
    if(editVal===origVal) { setEditCell(null); return }
    // coerce to number for numeric fields
    const numFields=['total_amount','paid_amount','swap_amount','commission','paid_remaining','swap_pending']
    const dbVal = numFields.includes(field) ? (parseFloat(editVal)||0) : (editVal||null)
    const {error} = await supabase.from('customer_sheet').update({[field]:dbVal}).eq('id',rowId)
    if(error){ showToast('Save failed: '+error.message,'error') }
    else {
      logAction({
        action: 'Customer Sheet Row Updated',
        module: 'Customer Sheet',
        details: {
          customer_name: row.customer_name,
          field_changed: field,
          old_value: String(origVal),
          new_value: String(dbVal ?? ''),
        },
      })
      // flash
      const key=`${rowId}__${field}`
      setFlashCells(s=>new Set(s).add(key))
      setTimeout(()=>setFlashCells(s=>{ const n=new Set(s); n.delete(key); return n }),800)
      // update local state immediately
      setAllRows(prev=>prev.map(r=>r.id===rowId?{...r,[field]:dbVal}:r))
    }
    setEditCell(null)
  }

  function cancelEdit() { setEditCell(null) }

  async function deleteRow(rowId:string) {
    const row = allRows.find(r=>r.id===rowId)
    const {error} = await supabase.from('customer_sheet').delete().eq('id',rowId)
    if(error){ showToast('Delete failed: '+error.message,'error') }
    else {
      setAllRows(prev=>prev.filter(r=>r.id!==rowId))
      showToast('Row deleted')
      if(row) {
        logAction({
          action: 'Customer Sheet Row Deleted',
          module: 'Customer Sheet',
          details: { customer_name: row.customer_name, id: rowId },
        })
      }
    }
    setDeleteConfirm(null)
  }

  // Editable cell renderer — returns a <td>
  function EC({ rowId, field, value, type='text', align='left', width, color, rowBg }:
    { rowId:string; field:string; value:string|number|null; type?:string; align?:string; width:number; color?:string; rowBg:string }) {
    const isEditing = editCell?.rowId===rowId && editCell?.field===field
    const flash = flashCells.has(`${rowId}__${field}`)
    const displayVal = value!=null&&value!==''
      ? (type==='number' ? Number(value).toLocaleString('en-IN') : (type==='date'?fmtD(String(value)):String(value)))
      : ''
    const bg = flash ? '#bbf7d0' : rowBg

    if(isEditing) return (
      <td style={{...CS_CS,width,background:'#fff',padding:0,overflow:'visible'}}>
        <input
          ref={editInputRef}
          autoFocus
          type={type==='number'?'number':type==='date'?'date':'text'}
          value={editVal}
          onChange={e=>setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); commitEdit() } if(e.key==='Escape') cancelEdit() }}
          style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'3px 5px',fontSize:12,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box'}}
        />
      </td>
    )
    return (
      <td
        onClick={()=>startEdit(rowId,field,value)}
        style={{...CS_CS,width,textAlign:align as 'left'|'right'|'center',background:bg,cursor:'text',color:color||'#000',transition:'background 0.4s'}}
      >
        {displayVal||<span style={{color:'#d1d5db'}}>—</span>}
      </td>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {toast&&<div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type==='success'?'bg-[#3ECF8E]':'bg-red-500'}`}>{toast.msg}</div>}

      {/* Delete confirm dialog */}
      {deleteConfirm&&(
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={()=>setDeleteConfirm(null)}/>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl z-[60] p-6 w-80">
            <div className="text-sm font-semibold text-[#1a1a1a] mb-2">Delete this entry?</div>
            <div className="text-xs text-[#6b7280] mb-4">This action cannot be undone.</div>
            <div className="flex gap-2">
              <button onClick={()=>setDeleteConfirm(null)} className="flex-1 py-2 rounded border text-xs font-medium text-[#374151]" style={{borderColor:'#e5e7eb'}}>Cancel</button>
              <button onClick={()=>deleteRow(deleteConfirm)} className="flex-1 py-2 rounded text-xs font-semibold text-white bg-red-500">Delete</button>
            </div>
          </div>
        </>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        <span className="text-xs text-[#6b7280]">{activeRows.length} rows · {activeCustomer||'No customer'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>{ setFCustName(activeCustomer); setCustSearch(activeCustomer); setShowInsert(true) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-white" style={{background:'#3ECF8E'}}>
            <Plus size={12}/> Insert Row
          </button>
          <button onClick={exportCustomerXlsx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium text-[#374151] hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>
            <Download size={12}/> Export .xlsx
          </button>
          <button onClick={fetchAll} className="p-1.5 rounded border hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}><RefreshCw size={12} color="#6b7280"/></button>
        </div>
      </div>
      {/* Table */}
      <div className="flex-1 overflow-auto" style={{fontFamily:'Calibri,Arial,sans-serif'}}>
        {loading?(
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
        ):(
          <table style={{width:CS_W+32,borderCollapse:'collapse',tableLayout:'fixed'}}>
            <tbody>
              {csDateGroups.length===0?(
                <tr><td colSpan={17} style={{textAlign:'center',padding:'32px',color:'#9ca3af'}}>No data for {activeCustomer||'this customer'}</td></tr>
              ):csDateGroups.map(([date,drows],gi)=>{
                const fmtD2=(d:string)=>{ if(!d) return ''; const [y,m,dd]=d.split('-'); return `${parseInt(dd)}/${parseInt(m)}/${y.slice(2)}` }
                return (
                  <React.Fragment key={date}>
                    {gi>0&&<tr><td colSpan={17} style={{border:'none',background:'#ffffff',height:16,padding:0}}/></tr>}
                    {gi>0&&<tr><td colSpan={17} style={{border:'none',background:'#ffffff',height:16,padding:0}}/></tr>}
                    <tr>
                      <td colSpan={17} style={{...CS_HS,textAlign:'center',fontSize:13,background:'#92D050'}}>
                        DATE {fmtD2(date)} — {activeCustomer}//WITH COM//--{monthRange}
                      </td>
                    </tr>
                    <tr>
                      <th style={{...CS_HS,width:CS_CW.due_date}}>DUE DATE</th>
                      <th style={{...CS_HS,width:CS_CW.customer_name}}>CM NAME</th>
                      <th style={{...CS_HS,width:CS_CW.card}}>CARD</th>
                      <th style={{...CS_HS,width:CS_CW.card_number}}>CARD NO</th>
                      <th style={{...CS_HS,width:CS_CW.pin}}>PIN</th>
                      <th style={{...CS_HS,width:CS_CW.cvv_expiry}}>CVV/EXPRY</th>
                      <th style={{...CS_HS,width:CS_CW.total_amount}}>TOTAL AMT</th>
                      <th style={{...CS_HS,width:CS_CW.paid_amount}}>PAID AMT</th>
                      <th style={{...CS_HS,width:CS_CW.swap_amount}}>SWAP AMT</th>
                      <th style={{...CS_HS,width:CS_CW.commission}}>COM</th>
                      <th style={{...CS_HS,width:CS_CW.paid_remaining}}>PAID REMAINING</th>
                      <th style={{...CS_HS,width:CS_CW.swap_pending}}>SWAP PENDING</th>
                      <th style={{...CS_HS,width:CS_CW.account_name}}>A/C NAME</th>
                      <th style={{...CS_HS,width:CS_CW.swap_name}}>SWAP NAME</th>
                      <th style={{...CS_HS,width:CS_CW.paid_date}}>PAID DATE</th>
                      <th style={{...CS_HS,width:CS_CW.card_network}}>VISA/MASTERCARD</th>
                      <th style={{...CS_HS,width:32,background:'#e8f5e9'}}></th>
                    </tr>
                    {drows.map((r,i)=>{
                      const rowBg=i%2===1?'#F0FFF0':'#ffffff'
                      return (
                        <tr key={r.id} className="group" style={{background:rowBg}}>
                          <EC rowId={r.id} field="due_date"       value={r.due_date}       type="date"   align="center" width={CS_CW.due_date}       rowBg={rowBg}/>
                          <EC rowId={r.id} field="customer_name"  value={r.customer_name}  type="text"   align="left"   width={CS_CW.customer_name}  rowBg={rowBg}/>
                          <EC rowId={r.id} field="card"           value={r.card}           type="text"   align="center" width={CS_CW.card}           rowBg={rowBg}/>
                          <EC rowId={r.id} field="card_number"    value={r.card_number}    type="text"   align="center" width={CS_CW.card_number}    rowBg={rowBg}/>
                          <EC rowId={r.id} field="pin"            value={r.pin}            type="text"   align="center" width={CS_CW.pin}            rowBg={rowBg}/>
                          <EC rowId={r.id} field="cvv_expiry"     value={r.cvv_expiry}     type="text"   align="center" width={CS_CW.cvv_expiry}     rowBg={rowBg}/>
                          <EC rowId={r.id} field="total_amount"   value={r.total_amount}   type="number" align="right"  width={CS_CW.total_amount}   rowBg={rowBg}/>
                          <EC rowId={r.id} field="paid_amount"    value={r.paid_amount}    type="number" align="right"  width={CS_CW.paid_amount}    rowBg={rowBg}/>
                          <EC rowId={r.id} field="swap_amount"    value={r.swap_amount}    type="number" align="right"  width={CS_CW.swap_amount}    rowBg={rowBg}/>
                          <EC rowId={r.id} field="commission"     value={r.commission}     type="number" align="right"  width={CS_CW.commission}     rowBg={rowBg} color="#2563eb"/>
                          <EC rowId={r.id} field="paid_remaining" value={r.paid_remaining} type="number" align="right"  width={CS_CW.paid_remaining} rowBg={rowBg}/>
                          <EC rowId={r.id} field="swap_pending"   value={r.swap_pending}   type="number" align="right"  width={CS_CW.swap_pending}   rowBg={rowBg}/>
                          <EC rowId={r.id} field="account_name"   value={r.account_name}   type="text"   align="left"   width={CS_CW.account_name}   rowBg={rowBg}/>
                          <EC rowId={r.id} field="swap_name"      value={r.swap_name}      type="text"   align="left"   width={CS_CW.swap_name}      rowBg={rowBg}/>
                          <EC rowId={r.id} field="paid_date"      value={r.paid_date}      type="date"   align="center" width={CS_CW.paid_date}      rowBg={rowBg}/>
                          <EC rowId={r.id} field="card_network"   value={r.card_network}   type="text"   align="center" width={CS_CW.card_network}   rowBg={rowBg}/>
                          <td style={{...CS_CS,width:32,padding:'2px 4px',textAlign:'center',background:rowBg}}>
                            <button
                              onClick={()=>setDeleteConfirm(r.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete row"
                              style={{color:'#ef4444',background:'none',border:'none',cursor:'pointer',fontSize:14,lineHeight:1,padding:'2px'}}
                            >✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Customer tabs */}
      <div style={{display:'flex',flexWrap:'wrap',borderTop:'1px solid #e5e7eb',background:'#f9f9f9',gap:'2px',padding:'4px'}}>
        {customers.length===0&&!loading&&(
          <span className="text-xs text-[#9ca3af] px-3 py-2">No customers yet. Submit Daily Register entries to populate.</span>
        )}
        {customers.map(c=>{
          const isActive=activeCustomer===c.customer_name
          return (
            <button key={c.customer_name} onClick={()=>setActiveCustomer(c.customer_name)}
              style={{padding:'8px 14px',fontSize:12,fontWeight:isActive?'bold':'normal',background:isActive?'#ffffff':'transparent',borderBottom:isActive?'2px solid #3ECF8E':'2px solid transparent',borderTop:'none',borderLeft:'none',borderRight:'none',cursor:'pointer',whiteSpace:'nowrap',color:isActive?'#000':'#6b7280',flexShrink:0}}
            >
              {c.customer_name} ({rowCountMap.get(c.customer_name)||0})
            </button>
          )
        })}
      </div>

      {/* Insert panel */}
      {showInsert&&(
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={()=>{ setShowInsert(false); resetInsertForm() }}/>
          <div className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col" style={{width:400,boxShadow:'-4px 0 20px rgba(0,0,0,0.12)'}}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <h2 className="font-semibold text-sm text-[#1a1a1a]">Insert Customer Sheet Row</h2>
              <button onClick={()=>{ setShowInsert(false); resetInsertForm() }} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280"/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {/* Customer autocomplete */}
              <div ref={custRef} className="relative">
                <label className={lb}>Customer Name *</label>
                <input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="Search customer..." value={custSearch}
                  onChange={e=>{ setCustSearch(e.target.value); setFCustName(e.target.value); setShowCustDrop(true) }}
                  onFocus={()=>custSearch.length>=2&&setShowCustDrop(true)}
                />
                {showCustDrop&&custSuggs.length>0&&(
                  <div className="absolute z-30 w-full bg-white border rounded-md shadow-lg mt-0.5" style={{borderColor:'#e5e7eb',maxHeight:160,overflowY:'auto'}}>
                    {custSuggs.map(c=>(
                      <button key={c.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f0fdf4]"
                        onClick={()=>{ setFCustName(c.name); setCustSearch(c.name); setFCustId(c.id); setCustCards(c.cards||[]); setShowCustDrop(false) }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone&&<span className="text-[#9ca3af] ml-2">— {c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Card select */}
              {custCards.length>0&&(
                <div>
                  <label className={lb}>Card</label>
                  <select className={inp+' bg-white'} style={{borderColor:'#e5e7eb'}} value={fCard} onChange={e=>selectCard(e.target.value)}>
                    <option value="">Select card...</option>
                    {custCards.map(c=><option key={c.id} value={c.bank_name}>{c.bank_name}</option>)}
                  </select>
                </div>
              )}
              {!custCards.length&&(
                <div>
                  <label className={lb}>Card</label>
                  <input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="e.g. HDFC" value={fCard} onChange={e=>setFCard(e.target.value)}/>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lb}>Due Date</label>
                  <input type="date" className={inp} style={{borderColor:'#e5e7eb'}} value={fDueDate} onChange={e=>setFDueDate(e.target.value)}/>
                </div>
                <div>
                  <label className={lb}>Date</label>
                  <input type="date" className={inp} style={{borderColor:'#e5e7eb'}} value={fDate} onChange={e=>setFDate(e.target.value)}/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lb}>PIN</label>
                  <input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="****" value={fPin} onChange={e=>setFPin(e.target.value)}/>
                </div>
                <div>
                  <label className={lb}>CVV/Expiry</label>
                  <input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="123/12/26" value={fCvvExpiry} onChange={e=>setFCvvExpiry(e.target.value)}/>
                </div>
                <div>
                  <label className={lb}>Network</label>
                  <select className={inp+' bg-white'} style={{borderColor:'#e5e7eb'}} value={fCardNetwork} onChange={e=>setFCardNetwork(e.target.value)}>
                    <option value="">—</option>
                    {['VISA','MASTERCARD','RUPAY','AMEX','OTHER'].map(n=><option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lb}>Total Amount *</label><input type="number" className={inp} style={{borderColor:'#e5e7eb'}} placeholder="0" value={fTotalAmt} onChange={e=>setFTotalAmt(e.target.value)}/></div>
                <div><label className={lb}>Paid Amount</label><input type="number" className={inp} style={{borderColor:'#e5e7eb'}} placeholder="0" value={fPaidAmt} onChange={e=>setFPaidAmt(e.target.value)}/></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lb}>Swap Amount</label><input type="number" className={inp} style={{borderColor:'#e5e7eb'}} placeholder="0" value={fSwapAmt} onChange={e=>setFSwapAmt(e.target.value)}/></div>
                <div><label className={lb}>Commission</label><input type="number" className={inp} style={{borderColor:'#e5e7eb'}} placeholder="0" value={fCommission} onChange={e=>setFCommission(e.target.value)}/></div>
              </div>
              <div><label className={lb}>A/C Name</label><input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="Account name" value={fAccountName} onChange={e=>setFAccountName(e.target.value)}/></div>
              <div><label className={lb}>Swap Name</label><input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="Swap name" value={fSwapName} onChange={e=>setFSwapName(e.target.value)}/></div>
              <div><label className={lb}>Paid Date</label><input type="date" className={inp} style={{borderColor:'#e5e7eb'}} value={fPaidDate} onChange={e=>setFPaidDate(e.target.value)}/></div>
            </div>
            <div className="px-4 py-3 border-t border-[#e5e7eb]">
              <button onClick={handleInsert} disabled={submitting} className="w-full py-2 rounded text-sm font-semibold text-white" style={{background:'#3ECF8E'}}>
                {submitting?'Saving...':'Save Row'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── CC Sheet types ─────────────────────────────────────────────────────────────
interface CCRow {
  id: string
  transaction_id: string | null
  machine_id: string | null
  tid: string
  machine_name: string
  date: string
  swipe_amount: number
  customer_amount: number
  bank_commission: number
  our_commission: number
  status: string
  customer_name: string
  agent_code: string
  account_name: string
}
// ── CC Sheet View ──────────────────────────────────────────────────────────────
function CCSheetView() {
  type Machine = {id:string;machine_name:string;tid:string;agent_code:string;bank_commission_pct:number}
  const [rows, setRows] = useState<CCRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showInsert, setShowInsert] = useState(false)
  const [machines, setMachines] = useState<Machine[]>([])
  const [allMachines, setAllMachines] = useState<Machine[]>([]) // all machines for export tabs
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null)
  const [activeMachine, setActiveMachine] = useState<string>('')

  // Insert form state
  const [fMachineId, setFMachineId] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0])
  const [fSwipeAmt, setFSwipeAmt] = useState('')
  const [fCustName, setFCustName] = useState('')
  const [fStatus, setFStatus] = useState('PAID')
  const [fAgentCode, setFAgentCode] = useState('')
  const [fTid, setFTid] = useState('')
  const [selectedMachine, setSelectedMachine] = useState<Machine|null>(null)
  // Customer autocomplete
  const [custSearch, setCustSearch] = useState('')
  const [custSuggs, setCustSuggs] = useState<{id:string;name:string;phone:string}[]>([])
  const [showCustDrop, setShowCustDrop] = useState(false)
  const custRef = useRef<HTMLDivElement>(null)

  const showToast = (msg:string,type:'success'|'error'='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const {data} = await supabase.from('cc_sheet').select('*').order('date',{ascending:true}).order('machine_name',{ascending:true})
    setRows((data as CCRow[])||[])
    setLoading(false)
  },[])

  useEffect(()=>{ fetchRows() },[fetchRows])

  useEffect(()=>{
    // Active machines for insert dropdown
    supabase.from('swipe_machines').select('id,machine_name,tid,agent_code,bank_commission_pct').eq('status','Active').then(({data})=>{
      setMachines((data as Machine[])||[])
    })
    // All machines (active+blocked) for export tabs
    supabase.from('swipe_machines').select('id,machine_name,tid,agent_code,bank_commission_pct').order('machine_name').then(({data})=>{
      const ms=(data as Machine[])||[]
      setAllMachines(ms)
      if(ms.length>0) setActiveMachine(prev=>prev||ms[0].machine_name)
    })
  },[])

  // Customer autocomplete debounce
  useEffect(()=>{
    if(custSearch.length<2){ setCustSuggs([]); return }
    const t=setTimeout(async()=>{
      const {data}=await supabase.from('customers').select('id,name,phone').ilike('name',`%${custSearch}%`).limit(10)
      setCustSuggs((data as {id:string;name:string;phone:string}[])||[])
      setShowCustDrop(true)
    },300)
    return ()=>clearTimeout(t)
  },[custSearch])

  // Close cust dropdown on outside click
  useEffect(()=>{
    function h(e:MouseEvent){ if(custRef.current&&!custRef.current.contains(e.target as Node)) setShowCustDrop(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])

  function onMachineSelect(id:string){
    setFMachineId(id)
    const m=machines.find(x=>x.id===id)||null
    setSelectedMachine(m)
    setFAgentCode(m?.agent_code||'')
    setFTid(m?.tid||'')
  }

  function resetInsertForm(){
    setFMachineId(''); setFDate(new Date().toISOString().split('T')[0]); setFSwipeAmt(''); setFCustName(''); setCustSearch(''); setFStatus('PAID'); setFAgentCode(''); setFTid(''); setSelectedMachine(null); setCustSuggs([])
  }

  async function handleInsert(){
    if(!fMachineId||!fSwipeAmt){ showToast('Machine and swipe amount required','error'); return }
    setSubmitting(true)
    const m=selectedMachine
    const swipeAmt=parseFloat(fSwipeAmt)||0
    const bankCommPct=m?.bank_commission_pct||1.320
    const bankComm=(swipeAmt*bankCommPct)/100
    const custAmt=swipeAmt-bankComm
    const ourComm=swipeAmt*2.2/100
    const {error}=await supabase.from('cc_sheet').insert({
      machine_id:fMachineId, tid:fTid, machine_name:m?.machine_name||'',
      date:fDate, swipe_amount:swipeAmt, customer_amount:custAmt,
      bank_commission:bankComm, our_commission:ourComm,
      status:fStatus, customer_name:fCustName.trim(), agent_code:fAgentCode,
    })
    if(error) showToast('Insert failed: '+error.message,'error')
    else { showToast('CC Sheet row added'); setShowInsert(false); resetInsertForm(); fetchRows() }
    setSubmitting(false)
  }

  async function exportCCXlsx(){
    const ExcelJS=(await import('exceljs')).default
    const wb=new ExcelJS.Workbook()
    wb.creator='SwipeSaaS'; wb.created=new Date()
    const border={top:{style:'thin' as const,color:{argb:'FF000000'}},bottom:{style:'thin' as const,color:{argb:'FF000000'}},left:{style:'thin' as const,color:{argb:'FF000000'}},right:{style:'thin' as const,color:{argb:'FF000000'}}}
    const colWidths=[{width:16},{width:20},{width:14},{width:15},{width:22},{width:18},{width:18},{width:10},{width:22},{width:12}]
    const headers=['BANK CODE NO','SWIPE MACHINE NAME','DATE','SWIPE AMOUNT','CUSTOMER AMOUNT','OUR COMMISSION','BANK COMMISSION','STATUS','CUSTOMER NAME','CODE']
    allMachines.forEach(machine=>{
      const ws=wb.addWorksheet(machine.machine_name.slice(0,31))
      ws.columns=colWidths
      // Header row
      const hRow=ws.addRow(headers)
      hRow.eachCell(c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}}
        c.font={bold:true,name:'Calibri',size:11}
        c.border=border
        c.alignment={horizontal:'center',vertical:'middle'}
      })
      // Data rows
      const mrows=rows.filter(r=>r.machine_name===machine.machine_name)
      if(mrows.length===0){
        const er=ws.addRow(['No data','','','','','','','','',''])
        er.eachCell({includeEmpty:true},c=>{ c.font={name:'Calibri',size:11}; c.border=border; c.alignment={horizontal:'center',vertical:'middle'} })
      } else {
        mrows.forEach(r=>{
          const d=new Date(r.date)
          const dateStr=`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`
          const dr=ws.addRow([r.tid||'',r.machine_name||'',dateStr,Number(r.swipe_amount)||0,Number(r.customer_amount)||0,Number(r.our_commission)||0,Number(r.bank_commission)||0,r.status||'',r.customer_name||'',r.agent_code||''])
          dr.eachCell({includeEmpty:true},(c,col)=>{
            c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}}
            c.font={name:'Calibri',size:11}
            c.border=border
            if(col>=4&&col<=7){ c.numFmt='#,##0.00'; c.alignment={horizontal:'right',vertical:'middle'} }
            else { c.alignment={horizontal:'center',vertical:'middle'} }
          })
        })
      }
    })
    const buf=await wb.xlsx.writeBuffer()
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url
    const today=new Date(); a.download=`CCSheet_${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(()=>URL.revokeObjectURL(url),10000)
  }

  const HS:React.CSSProperties={border:'1px solid #000',padding:'3px 6px',fontSize:12,fontFamily:'Calibri,Arial,sans-serif',background:'#FFFF00',color:'#000',fontWeight:'bold',textAlign:'center',whiteSpace:'nowrap'}
  const CS:React.CSSProperties={border:'1px solid #000',padding:'3px 6px',fontSize:12,fontFamily:'Calibri,Arial,sans-serif',background:'#ffffff',color:'#000',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',verticalAlign:'middle',textAlign:'center'}
  const CW={tid:120,machine_name:150,date:100,swipe_amount:120,customer_amount:150,our_commission:130,bank_commission:130,status:90,customer_name:160,agent_code:80}
  const W=Object.values(CW).reduce((s,v)=>s+v,0)
  const activeRows = React.useMemo(()=>rows.filter(r=>r.machine_name===activeMachine),[rows,activeMachine])
  const ccDateGroups = React.useMemo(()=>{
    const map=new Map<string,CCRow[]>()
    activeRows.forEach(r=>{ const d=r.date||''; if(!map.has(d)) map.set(d,[]); map.get(d)!.push(r) })
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b))
  },[activeRows])
  const rowCountByMachine = React.useMemo(()=>{
    const m=new Map<string,number>(); rows.forEach(r=>{ m.set(r.machine_name,(m.get(r.machine_name)||0)+1) }); return m
  },[rows])

  const inp='w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]'
  const lb='block text-[11px] font-medium text-[#374151] mb-0.5'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {toast&&<div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type==='success'?'bg-[#3ECF8E]':'bg-red-500'}`}>{toast.msg}</div>}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        <span className="text-xs text-[#6b7280]">{activeRows.length} rows · {activeMachine||'No machine selected'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>{ const m=machines.find(x=>x.machine_name===activeMachine); if(m) onMachineSelect(m.id); setShowInsert(true) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-white" style={{background:'#3ECF8E'}}>
            <Plus size={12}/> Insert Row
          </button>
          <button onClick={exportCCXlsx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium text-[#374151] hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>
            <Download size={12}/> Export .xlsx
          </button>
          <button onClick={fetchRows} className="p-1.5 rounded border hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}><RefreshCw size={12} color="#6b7280"/></button>
        </div>
      </div>
      {/* Table */}
      <div className="flex-1 overflow-auto" style={{fontFamily:'Calibri,Arial,sans-serif'}}>
        {loading?(
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
        ):(
          <table style={{width:W,borderCollapse:'collapse',tableLayout:'fixed'}}>
            <tbody>
              {ccDateGroups.length===0?(
                <tr><td colSpan={10} style={{textAlign:'center',padding:'32px',color:'#9ca3af'}}>No data for {activeMachine||'this machine'}</td></tr>
              ):ccDateGroups.map(([date,drows],gi)=>{
                const fmtD2=(d:string)=>{ if(!d) return ''; const [y,m,dd]=d.split('-'); return `${parseInt(dd)}/${parseInt(m)}/${y.slice(2)}` }
                return (
                  <React.Fragment key={date}>
                    {gi>0&&<tr><td colSpan={10} style={{border:'none',background:'#ffffff',height:16,padding:0}}/></tr>}
                    {gi>0&&<tr><td colSpan={10} style={{border:'none',background:'#ffffff',height:16,padding:0}}/></tr>}
                    <tr>
                      <td colSpan={10} style={{...HS,textAlign:'center',fontSize:13}}>DATE {fmtD2(date)}</td>
                    </tr>
                    <tr>
                      <th style={{...HS,width:CW.tid}}>BANK CODE NO / TID</th>
                      <th style={{...HS,width:CW.machine_name}}>SWIPE MACHINE NAME</th>
                      <th style={{...HS,width:CW.date}}>DATE</th>
                      <th style={{...HS,width:CW.swipe_amount}}>SWIPE AMOUNT</th>
                      <th style={{...HS,width:CW.customer_amount}}>CUSTOMER AMOUNT</th>
                      <th style={{...HS,width:CW.our_commission}}>OUR COMMISSION</th>
                      <th style={{...HS,width:CW.bank_commission}}>BANK COMMISSION</th>
                      <th style={{...HS,width:CW.status}}>STATUS</th>
                      <th style={{...HS,width:CW.customer_name}}>CUSTOMER NAME</th>
                      <th style={{...HS,width:CW.agent_code}}>CODE</th>
                    </tr>
                    {drows.map(r=>{
                      const d=new Date(r.date); const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); const yy=String(d.getFullYear()).slice(2)
                      return (
                        <tr key={r.id}>
                          <td style={{...CS,width:CW.tid,textAlign:'center'}}>{r.tid}</td>
                          <td style={{...CS,width:CW.machine_name}}>{r.machine_name}</td>
                          <td style={{...CS,width:CW.date,textAlign:'center'}}>{`${parseInt(dd)}/${parseInt(mm)}/${yy}`}</td>
                          <td style={{...CS,width:CW.swipe_amount,textAlign:'center'}}>{r.swipe_amount?Number(r.swipe_amount).toLocaleString('en-IN'):''}</td>
                          <td style={{...CS,width:CW.customer_amount,textAlign:'center'}}>{r.customer_amount?Number(r.customer_amount).toLocaleString('en-IN'):''}</td>
                          <td style={{...CS,width:CW.our_commission,textAlign:'center',color:'#2563eb'}}>{r.our_commission?Number(r.our_commission).toLocaleString('en-IN'):''}</td>
                          <td style={{...CS,width:CW.bank_commission,textAlign:'center'}}>{r.bank_commission?Number(r.bank_commission).toLocaleString('en-IN'):''}</td>
                          <td style={{...CS,width:CW.status,textAlign:'center'}}>{r.status}</td>
                          <td style={{...CS,width:CW.customer_name}}>{r.customer_name}</td>
                          <td style={{...CS,width:CW.agent_code,textAlign:'center'}}>{r.agent_code}</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Machine tabs */}
      <div style={{display:'flex',flexWrap:'wrap',borderTop:'1px solid #e5e7eb',background:'#f9f9f9',gap:'2px',padding:'4px'}}>
        {allMachines.map(machine=>{
          const count=rowCountByMachine.get(machine.machine_name)||0
          const isActive=activeMachine===machine.machine_name
          return (
            <button key={machine.id} onClick={()=>setActiveMachine(machine.machine_name)}
              style={{padding:'8px 16px',fontSize:12,fontWeight:isActive?'bold':'normal',background:isActive?'#ffffff':'transparent',borderBottom:isActive?'2px solid #3ECF8E':'2px solid transparent',borderTop:'none',borderLeft:'none',borderRight:'none',cursor:'pointer',whiteSpace:'nowrap',color:isActive?'#000':'#6b7280',flexShrink:0}}
            >
              {machine.machine_name}{count>0?` (${count})`:''}
            </button>
          )
        })}
      </div>

      {/* Insert panel */}
      {showInsert&&(
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={()=>{ setShowInsert(false); resetInsertForm() }}/>
          <div className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col" style={{width:380,boxShadow:'-4px 0 20px rgba(0,0,0,0.12)'}}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <h2 className="font-semibold text-sm text-[#1a1a1a]">Insert CC Sheet Row</h2>
              <button onClick={()=>{ setShowInsert(false); resetInsertForm() }} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280"/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              <div>
                <label className={lb}>Machine *</label>
                <select className={inp+' bg-white'} style={{borderColor:'#e5e7eb'}} value={fMachineId} onChange={e=>onMachineSelect(e.target.value)}>
                  <option value="">Select machine...</option>
                  {machines.map(m=><option key={m.id} value={m.id}>{m.machine_name}</option>)}
                </select>
              </div>
              <div>
                <label className={lb}>Date</label>
                <input type="date" className={inp} style={{borderColor:'#e5e7eb'}} value={fDate} onChange={e=>setFDate(e.target.value)}/>
              </div>
              <div>
                <label className={lb}>Swipe Amount *</label>
                <input type="number" className={inp} style={{borderColor:'#e5e7eb'}} placeholder="0" value={fSwipeAmt} onChange={e=>setFSwipeAmt(e.target.value)}/>
              </div>
              {/* Customer name with autocomplete */}
              <div ref={custRef} className="relative">
                <label className={lb}>Customer Name</label>
                <input className={inp} style={{borderColor:'#e5e7eb'}} placeholder="Search customer..." value={custSearch}
                  onChange={e=>{ setCustSearch(e.target.value); setFCustName(e.target.value); setShowCustDrop(true) }}
                  onFocus={()=>custSearch.length>=2&&setShowCustDrop(true)}
                />
                {showCustDrop&&custSuggs.length>0&&(
                  <div className="absolute z-30 w-full bg-white border rounded-md shadow-lg mt-0.5" style={{borderColor:'#e5e7eb',maxHeight:160,overflowY:'auto'}}>
                    {custSuggs.map(c=>(
                      <button key={c.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#f0fdf4]"
                        onClick={()=>{ setFCustName(c.name); setCustSearch(c.name); setShowCustDrop(false) }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone&&<span className="text-[#9ca3af] ml-2">— {c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={lb}>Status</label>
                <select className={inp+' bg-white'} style={{borderColor:'#e5e7eb'}} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
                  {['PAID','PEND','PURU','UNPAID','SE','CANCEL'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={lb}>Agent Code {selectedMachine&&<span className="text-[10px] text-[#9ca3af] ml-1">(auto-filled from machine)</span>}</label>
                <input className={inp} style={{borderColor:'#e5e7eb',background:selectedMachine?'#f3f4f6':'white',cursor:selectedMachine?'not-allowed':'text'}}
                  placeholder="Auto-fills from machine" value={fAgentCode} readOnly={!!selectedMachine}
                  onChange={e=>{ if(!selectedMachine) setFAgentCode(e.target.value) }}/>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#e5e7eb]">
              <button onClick={handleInsert} disabled={submitting} className="w-full py-2 rounded text-sm font-semibold text-white" style={{background:'#3ECF8E'}}>
                {submitting?'Saving...':'Save Row'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Dynamic month tab type ─────────────────────────────────────────────────────
interface MonthTab { key: string; label: string; year: number; month: number; count: number }

// ── Sheet Table Component ──────────────────────────────────────────────────────
const TBL_HS:React.CSSProperties={border:'1px solid #000',padding:'3px 6px',fontSize:13,fontFamily:'Calibri,Arial,sans-serif',background:'#FFFF00',color:'#000',fontWeight:'bold',textAlign:'center',whiteSpace:'nowrap'}
const TBL_CS:React.CSSProperties={border:'1px solid #000',padding:'3px 6px',fontSize:13,fontFamily:'Calibri,Arial,sans-serif',background:'#ffffff',color:'#000',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',verticalAlign:'middle',textAlign:'center'}
const TBL_ES:React.CSSProperties={border:'none',background:'#ffffff',height:16,padding:0}
const TBL_CW={sr_no:70,date:120,customer_name:180,bank_card:90,total_amount:115,paid_amount:110,account_name:160,swap_amount:115,swap_name:150,difference:100,remarks:90}
const TBL_W=Object.values(TBL_CW).reduce((s,v)=>s+v,0)
interface SheetTableProps {
  dateGroups: [string, TxRow[]][]
  flashCells: Set<string>
  editCell: {id:string;col:string;value:string}|null
  renderCell: (row:TxRow, col:ColDef) => React.ReactNode
  startEdit: (row:TxRow, col:string) => void
  COLS: ColDef[]
}

function SheetTable({dateGroups,flashCells,editCell,renderCell,startEdit,COLS}:SheetTableProps){
  const fc=(rowId:string,col:string)=>flashCells.has(`${rowId}__${col}`)
  const bg=(rowId:string,col:string)=>fc(rowId,col)?'#bbf7d0':'#ffffff'
  const editCol=(row:TxRow,col:string)=>{ if(editCell?.id!==row.id) startEdit(row,col) }
  const colDef=(k:string)=>COLS.find(c=>(c.key as string)===k)!

  return (
    <table style={{width:TBL_W,borderCollapse:'collapse',tableLayout:'fixed'}}>
      <tbody>
        {dateGroups.length===0?(
          <tr><td colSpan={11} style={{textAlign:'center',padding:'32px',color:'#9ca3af',border:'1px solid #e5e7eb'}}>No data for this month</td></tr>
        ):dateGroups.map(([date,drows],gi)=>(
          <React.Fragment key={date}>
            {gi>0&&<tr><td colSpan={11} style={TBL_ES}/></tr>}
            {gi>0&&<tr><td colSpan={11} style={TBL_ES}/></tr>}
            <tr>
              <td colSpan={11} style={{...TBL_HS,textAlign:'center'}}>DATE {fmtDate(date)}</td>
            </tr>
            <tr>
              <th style={{...TBL_HS,width:TBL_CW.sr_no}}>SR NO</th>
              <th style={{...TBL_HS,width:TBL_CW.date}}>DATE</th>
              <th style={{...TBL_HS,width:TBL_CW.customer_name}}>CUSTOMER NAME</th>
              <th style={{...TBL_HS,width:TBL_CW.bank_card}}>BANK CARD</th>
              <th style={{...TBL_HS,width:TBL_CW.total_amount}}>TOTAL AMOUNT</th>
              <th style={{...TBL_HS,width:TBL_CW.paid_amount}}>PAID AMOUNT</th>
              <th style={{...TBL_HS,width:TBL_CW.account_name}}>A/C NAME</th>
              <th style={{...TBL_HS,width:TBL_CW.swap_amount}}>SWAP AMOUNT</th>
              <th style={{...TBL_HS,width:TBL_CW.swap_name}}>SWAP NAME</th>
              <th style={{...TBL_HS,width:TBL_CW.difference}}>DIFFERENCE</th>
              <th style={{...TBL_HS,width:TBL_CW.remarks}}>REMARKS</th>
            </tr>
            {drows.map((row,ri)=>(
              <tr key={row.id}
                style={{background:'#ffffff'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#FFFEF0')}
                onMouseLeave={e=>(e.currentTarget.style.background='#ffffff')}
              >
                <td style={{...TBL_CS,width:TBL_CW.sr_no,textAlign:'center'}}>{row.sr_no}</td>
                <td style={{...TBL_CS,width:TBL_CW.date,textAlign:'center',cursor:'pointer'}} onClick={()=>editCol(row,'date')}>
                  {ri===0?fmtDate(row.date):''}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.customer_name,cursor:'pointer',background:bg(row.id,'customer_name')}} onClick={()=>editCol(row,'customer_name')}>
                  {editCell?.id===row.id&&editCell.col==='customer_name'?renderCell(row,colDef('customer_name')):<>{row.customer_name||''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.bank_card,textAlign:'center',cursor:'pointer',background:bg(row.id,'bank_card')}} onClick={()=>editCol(row,'bank_card')}>
                  {editCell?.id===row.id&&editCell.col==='bank_card'?renderCell(row,colDef('bank_card')):<>{row.bank_card||''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.total_amount,textAlign:'center',cursor:'pointer',background:bg(row.id,'total_amount')}} onClick={()=>editCol(row,'total_amount')}>
                  {editCell?.id===row.id&&editCell.col==='total_amount'?renderCell(row,colDef('total_amount')):<>{row.total_amount!=null?fmtAmt(Number(row.total_amount)):''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.paid_amount,textAlign:'center',cursor:'pointer',background:bg(row.id,'paid_amount')}} onClick={()=>editCol(row,'paid_amount')}>
                  {editCell?.id===row.id&&editCell.col==='paid_amount'?renderCell(row,colDef('paid_amount')):<>{row.paid_amount!=null?fmtAmt(Number(row.paid_amount)):''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.account_name,cursor:'pointer',background:bg(row.id,'account_name')}} onClick={()=>editCol(row,'account_name')}>
                  {editCell?.id===row.id&&editCell.col==='account_name'?renderCell(row,colDef('account_name')):<>{row.account_name||''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.swap_amount,textAlign:'center',cursor:'pointer',background:bg(row.id,'swap_amount')}} onClick={()=>editCol(row,'swap_amount')}>
                  {editCell?.id===row.id&&editCell.col==='swap_amount'?renderCell(row,colDef('swap_amount')):<>{row.swap_amount!=null?fmtAmt(Number(row.swap_amount)):''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.swap_name,cursor:'pointer',background:bg(row.id,'swap_name')}} onClick={()=>editCol(row,'swap_name')}>
                  {editCell?.id===row.id&&editCell.col==='swap_name'?renderCell(row,colDef('swap_name')):<>{row.swap_name||''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.difference,textAlign:'center',cursor:'pointer',background:bg(row.id,'difference')}} onClick={()=>editCol(row,'difference')}>
                  {editCell?.id===row.id&&editCell.col==='difference'?renderCell(row,colDef('difference')):<>{row.difference!=null?fmtAmt(Number(row.difference)):''}</>}
                </td>
                <td style={{...TBL_CS,width:TBL_CW.remarks,textAlign:'center',cursor:'pointer',color:remarkColor(row.remarks),background:bg(row.id,'remarks')}} onClick={()=>editCol(row,'remarks')}>
                  {editCell?.id===row.id&&editCell.col==='remarks'?renderCell(row,colDef('remarks')):<>{row.remarks||''}</>}
                </td>
                <td style={{width:110,minWidth:110,padding:'0 8px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {editCell?.id===row.id&&editCell.col==='commission_type'?renderCell(row,colDef('commission_type')):(()=>{
                    const ct=row.commission_type||'Inclusive'
                    const style={Inclusive:{bg:'#d1fae5',color:'#065f46'},Exclusive:{bg:'#dbeafe',color:'#1e40af'},Deferred:{bg:'#fef9c3',color:'#854d0e'}}[ct]||{bg:'#f3f4f6',color:'#374151'}
                    return <span style={{background:style.bg,color:style.color,padding:'1px 6px',borderRadius:4,fontSize:10,fontWeight:600}}>{ct}</span>
                  })()}
                </td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SheetsPage() {
  const auth = useAuth()
  const [allRows, setAllRows]     = useState<TxRow[]>([])  // master — unfiltered
  const [loading, setLoading]     = useState(false)
  const [customSheets, setCustomSheets] = useState<{ id: string; label: string; themeColor: string; columns: { key: string; label: string }[] }[]>([])
  const [realtimeOk, setRealtimeOk] = useState(false)
  // 'all' = no month filter; otherwise "<year>-<month>"
  const [activeMonthKey, setActiveMonthKey] = useState<string>('all')
  const [colWidths, setColWidths] = useState<Record<string,number>>({})
  const [activeSheet, setActiveSheet] = useState('daily_register')
  const [openTabs, setOpenTabs]   = useState(['daily_register'])

  // Load custom sheets + their columns from Supabase
  useEffect(() => {
    async function loadCustomSheets() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: sheetData }, { data: colData }] = await Promise.all([
        supabase.from('sheets').select('sheet_key, label, theme_color').eq('user_id', user.id).eq('is_custom', true).order('created_at', { ascending: true }),
        supabase.from('sheet_columns').select('sheet_key, column_key, label, column_order').eq('user_id', user.id).order('created_at', { ascending: true }),
      ])
      if (sheetData) {
        setCustomSheets(sheetData.map(s => ({
          id: s.sheet_key,
          label: s.label,
          themeColor: s.theme_color ?? '#7F77DD',
          columns: (colData ?? [])
            .filter(c => c.sheet_key === s.sheet_key)
            .sort((a, b) => (a.column_order ?? 0) - (b.column_order ?? 0))
            .map(c => ({ key: c.column_key, label: c.label })),
        })))
      }
    }
    loadCustomSheets()
  }, [])

  const allLeftSheets = [
    ...LEFT_SHEETS,
    ...customSheets.map(s => ({ id: s.id, label: s.label, ready: true })),
  ]

  // Derive dynamic month tabs from actual data
  const monthTabs = useMemo((): MonthTab[] => {
    const map = new Map<string, MonthTab>()
    allRows.forEach(r => {
      const d = new Date(r.date)
      const y = d.getFullYear(); const m = d.getMonth() + 1
      const key = `${y}-${m}`
      if (!map.has(key)) {
        map.set(key, {
          key, year: y, month: m, count: 0,
          label: d.toLocaleString('en-IN', { month: 'long' }).toUpperCase() + ' ' + y,
        })
      }
      map.get(key)!.count++
    })
    return Array.from(map.values()).sort((a, b) =>
      new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime()
    )
  }, [allRows])

  // rows shown = allRows filtered by active month tab
  const rows = useMemo(() => {
    if (activeMonthKey === 'all') return allRows
    const [y, m] = activeMonthKey.split('-').map(Number)
    return allRows.filter(r => {
      const d = new Date(r.date)
      return d.getFullYear() === y && d.getMonth() + 1 === m
    })
  }, [allRows, activeMonthKey])

  // Toolbar
  const [showFilter, setShowFilter] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')
  const [filterRemark, setFilterRemark] = useState('All')
  const [filterCust,   setFilterCust]   = useState('')
  const [sortKey, setSortKey]     = useState<keyof TxRow>('sr_no')
  const [sortAsc, setSortAsc]     = useState(true)
  const [showSortDrop, setShowSortDrop] = useState(false)

  // Pagination
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(100)
  const [viewMode, setViewMode]   = useState<'data'|'summary'>('data')

  // Editing
  const [editCell, setEditCell]   = useState<{id:string;col:string;value:string}|null>(null)
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set())
  const editRef = useRef<HTMLInputElement>(null)

  // Search
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Insert panel
  const [showInsert, setShowInsert] = useState(false)

  // Column resize
  const resizeRef = useRef<{col:string;startX:number;startW:number}|null>(null)

  // ── Fetch ALL data once; month filtering is client-side ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('transactions').select('*').order('sr_no', { ascending: true })

    // Sub admin: filter to only their assigned accounts
    if (auth?.role === 'sub_admin' && auth.assigned_accounts.length > 0) {
      const accountFilter = auth.assigned_accounts
        .map(a => `account_name.ilike.%${a}%`)
        .join(',')
      query = query.or(accountFilter)
    }

    const { data, error } = await query
    if (error) console.error('[sheets] fetch error:', error.message)
    const fetched = (data as TxRow[]) || []
    console.log('[sheets] fetched', fetched.length, 'rows')
    setAllRows(fetched)
    setPage(1)
    setLoading(false)
  }, [auth])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('sheets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchAll()
      })
      .subscribe(status => setRealtimeOk(status === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  // Focus edit input
  useEffect(()=>{ if(editCell) editRef.current?.focus() },[editCell])

  // Ctrl+F
  useEffect(()=>{
    function h(e:KeyboardEvent){
      if((e.ctrlKey||e.metaKey)&&e.key==='f'&&activeSheet==='daily_register'){
        e.preventDefault(); setShowSearch(v=>!v)
        if(!showSearch) setTimeout(()=>searchRef.current?.focus(),50)
      }
      if(e.key==='Escape'){setShowSearch(false);setEditCell(null);setShowSortDrop(false);setShowFilter(false)}
    }
    document.addEventListener('keydown',h)
    return()=>document.removeEventListener('keydown',h)
  },[activeSheet,showSearch])

  // ── Filtered + sorted rows ──
  const filtered = useMemo(()=>{
    let r=[...rows]
    if(filterFrom) r=r.filter(x=>x.date>=filterFrom)
    if(filterTo)   r=r.filter(x=>x.date<=filterTo)
    if(filterRemark!=='All') r=r.filter(x=>x.remarks===filterRemark)
    if(filterCust)  r=r.filter(x=>x.customer_name.toLowerCase().includes(filterCust.toLowerCase()))
    if(searchQuery) r=r.filter(x=>
      x.customer_name.toLowerCase().includes(searchQuery.toLowerCase())||
      String(x.sr_no).includes(searchQuery)||
      x.bank_card.toLowerCase().includes(searchQuery.toLowerCase())
    )
    r.sort((a,b)=>{
      const av=a[sortKey], bv=b[sortKey]
      if(av==null) return 1; if(bv==null) return -1
      const cmp = av<bv?-1:av>bv?1:0
      return sortAsc?cmp:-cmp
    })
    return r
  },[rows,filterFrom,filterTo,filterRemark,filterCust,searchQuery,sortKey,sortAsc])

  // Pagination
  const totalPages = Math.max(1,Math.ceil(filtered.length/pageSize))
  const pageRows = filtered.slice((page-1)*pageSize, page*pageSize)

  // Date groups for current page
  const dateGroups = useMemo(()=>{
    const map = new Map<string,TxRow[]>()
    pageRows.forEach(r=>{ const d=r.date; if(!map.has(d)) map.set(d,[]); map.get(d)!.push(r) })
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b))
  },[pageRows])

  // Summary
  const summary = useMemo(()=>({
    total:  filtered.reduce((s,r)=>s+(r.total_amount||0),0),
    paid:   filtered.reduce((s,r)=>s+(r.paid_amount||0),0),
    swap:   filtered.reduce((s,r)=>s+(r.swap_amount||0),0),
    paidCount:  filtered.filter(r=>r.remarks==='PAID').length,
    pendCount:  filtered.filter(r=>r.remarks==='PEND').length,
    puruCount:  filtered.filter(r=>r.remarks==='PURU').length,
  }),[filtered])

  // ── Inline edit ──
  function startEdit(row:TxRow, col:string){
    const val = String((row as unknown as Record<string,unknown>)[col]??'')
    setEditCell({id:row.id, col, value:val})
  }

  async function commitEdit(){
    if(!editCell) return
    const {id,col,value} = editCell
    let parsed: string|number|null = value
    if(['total_amount','paid_amount','swap_amount','difference'].includes(col)){
      parsed = value===''?null:parseFloat(value)||0
    }
    setEditCell(null)
    const {error} = await supabase.from('transactions').update({[col]:parsed}).eq('id',id)
    if(!error){
      const oldRow = allRows.find((r:TxRow)=>r.id===id)
      logAction({
        action: 'Transaction Updated',
        module: 'Daily Register',
        details: {
          sr_no: oldRow?.sr_no,
          field_changed: col,
          old_value: String(oldRow?.[col as keyof TxRow] ?? ''),
          new_value: String(parsed ?? ''),
          customer_name: oldRow?.customer_name,
        },
      })
      setAllRows(rs=>rs.map((r:TxRow)=>r.id===id?{...r,[col]:parsed}:r))
      const key=`${id}__${col}`
      setFlashCells(s=>new Set(Array.from(s).concat(key)))
      setTimeout(()=>setFlashCells(s=>{const n=new Set(Array.from(s));n.delete(key);return n}),700)
    }
  }

  // ── Column resize ──
  function startResize(e:React.MouseEvent,col:string){
    e.preventDefault()
    const startX=e.clientX
    const startW=colWidths[col]||(COLS.find(c=>c.key===col)?.width||100)
    resizeRef.current={col,startX,startW}
    function onMove(ev:MouseEvent){
      if(!resizeRef.current) return
      const newW=Math.max(40,resizeRef.current.startW+(ev.clientX-resizeRef.current.startX))
      setColWidths(w=>({...w,[resizeRef.current!.col]:newW}))
    }
    function onUp(){resizeRef.current=null;window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
  }

  // ── Export ──
  async function exportXlsx(){
    const ExcelJS=(await import('exceljs')).default
    const wb=new ExcelJS.Workbook()
    const ws=wb.addWorksheet('Daily Register')
    const activeTab=monthTabs.find(t=>t.key===activeMonthKey)
    const tabLabel=activeTab?activeTab.label:'ALL'

    // Column definitions — key names MUST match the row object keys used below
    ws.columns=[
      {key:'empty',        width:3 },
      {key:'sr_no',        width:10},
      {key:'date',         width:16},
      {key:'customer_name',width:24},
      {key:'bank_card',    width:14},
      {key:'total_amount', width:16},
      {key:'paid_amount',  width:16},
      {key:'account_name', width:26},
      {key:'swap_amount',  width:16},
      {key:'swap_name',    width:26},
      {key:'difference',   width:14},
      {key:'remarks',      width:12},
    ]

    type Fill   = import('exceljs').Fill
    type Border = import('exceljs').Borders
    const yellow:Fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}}
    const white:Fill  = {type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}}
    const centerAll   = {horizontal:'center' as const,vertical:'middle' as const}
    const border = {top:{style:'thin' as const,color:{argb:'FF000000'}},bottom:{style:'thin' as const,color:{argb:'FF000000'}},left:{style:'thin' as const,color:{argb:'FF000000'}},right:{style:'thin' as const,color:{argb:'FF000000'}}} as Border
    const AMOUNT_KEYS = ['total_amount','paid_amount','swap_amount','difference']

    function applyBorder(row: import('exceljs').Row){
      row.eachCell({includeEmpty:true},c=>{ c.border=border })
    }

    // Group by date (client-side, using already-filtered rows)
    const groups = new Map<string,TxRow[]>()
    filtered.forEach(r=>{ if(!groups.has(r.date)) groups.set(r.date,[]); groups.get(r.date)!.push(r) })
    const sortedDates = Array.from(groups.keys()).sort()

    sortedDates.forEach((dateKey, gi)=>{
      const rws = groups.get(dateKey)!
      const d   = new Date(dateKey)
      const dd  = String(d.getDate()).padStart(2,'0')
      const mm  = String(d.getMonth()+1).padStart(2,'0')
      const yyyy= d.getFullYear()
      const displayDate = `${dd}/${mm}/${yyyy}`
      const shortDate   = `${parseInt(dd)}/${parseInt(mm)}/${String(yyyy).slice(2)}`

      // 2 empty spacer rows between groups — zero styling
      if(gi>0){
        const sp1=ws.addRow(['','','','','','','','','','','',''])
        sp1.height=15
        for(let col=1;col<=12;col++){const c=sp1.getCell(col);c.fill={type:'pattern',pattern:'none'} as Fill;c.border={};c.value=null;c.font={}}
        const sp2=ws.addRow(['','','','','','','','','','','',''])
        sp2.height=15
        for(let col=1;col<=12;col++){const c=sp2.getCell(col);c.fill={type:'pattern',pattern:'none'} as Fill;c.border={};c.value=null;c.font={}}
      }

      // DATE header row — yellow only on B:L, not full row
      const dRow = ws.addRow({})
      dRow.height=18
      const dNum=dRow.number
      ws.mergeCells(dNum,2,dNum,12)
      const dMerged=ws.getCell(dNum,2)
      dMerged.value=`DATE ${shortDate}`
      dMerged.fill=yellow
      dMerged.font={bold:true,size:11,name:'Calibri'}
      dMerged.alignment=centerAll
      dMerged.border=border
      // apply border to all cells in range
      for(let col=2;col<=12;col++){ws.getCell(dNum,col).border=border}

      // Column headers row — yellow only on B:L
      const hRow = ws.addRow({
        empty:'', sr_no:'SR NO', date:'DATE', customer_name:'CUSTOMER NAME',
        bank_card:'BANK CARD', total_amount:'TOTAL AMOUNT', paid_amount:'PAID AMOUNT',
        account_name:'A/C NAME', swap_amount:'SWAP AMOUNT', swap_name:'SWAP NAME',
        difference:'DIFFERENCE', remarks:'REMARKS',
      })
      hRow.height=18
      hRow.font={bold:true,size:11,name:'Calibri'}
      hRow.alignment=centerAll
      for(let col=2;col<=12;col++){const c=hRow.getCell(col);c.fill=yellow;c.border=border}

      // Data rows
      rws.forEach((r,ri)=>{
        const dr = ws.addRow({
          empty:'',
          sr_no: r.sr_no,
          date:  ri===0 ? displayDate : '',
          customer_name: r.customer_name||'',
          bank_card:     r.bank_card||'',
          total_amount:  r.total_amount!=null ? Number(r.total_amount) : '',
          paid_amount:   r.paid_amount!=null  ? Number(r.paid_amount)  : '',
          account_name:  r.account_name||'',
          swap_amount:   r.swap_amount!=null  ? Number(r.swap_amount)  : '',
          swap_name:     r.swap_name||'',
          difference:    r.difference!=null   ? Number(r.difference)   : '',
          remarks:       r.remarks||'',
        })
        dr.font={size:11,name:'Calibri'}
        dr.fill=white
        dr.alignment=centerAll
        AMOUNT_KEYS.forEach(k=>{
          const c=dr.getCell(k); if(c.value!==''){c.numFmt='#,##0'}
        })
        dr.getCell('account_name').alignment={horizontal:'center',vertical:'middle',wrapText:true}
        dr.getCell('swap_name').alignment={horizontal:'center',vertical:'middle',wrapText:true}
        applyBorder(dr)
      })
    })

    // Freeze header (first 3 rows of first date group are spacer+date+headers — freeze after row 4 approx)
    ws.views=[{state:'frozen',ySplit:1,xSplit:0}]

    // Clear all columns beyond L (col 12) to prevent ExcelJS spilling borders/fills
    ws.eachRow(row=>{
      for(let col=13;col<=50;col++){
        const c=row.getCell(col)
        c.value=null
        c.fill={type:'pattern',pattern:'none'} as import('exceljs').Fill
        c.border={}
        c.font={}
        c.alignment={}
        c.numFmt=''
      }
    })
    for(let i=13;i<=50;i++){
      const col=ws.getColumn(i)
      col.width=0.1
      col.hidden=true
    }
    ws.pageSetup={printArea:'A1:L1000'}

    const buf=await wb.xlsx.writeBuffer()
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
    const a=document.createElement('a')
    a.href=URL.createObjectURL(blob)
    a.download=`DailyRegister_${tabLabel}_${new Date().toISOString().split('T')[0]}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── Tab helpers ──
  function openSheet(id:string){
    if(!openTabs.includes(id)) setOpenTabs(t=>[...t,id])
    setActiveSheet(id)
  }
  function closeTab(id:string,e:React.MouseEvent){
    e.stopPropagation()
    const remaining=openTabs.filter(t=>t!==id)
    setOpenTabs(remaining)
    if(activeSheet===id) setActiveSheet(remaining[remaining.length-1]||'daily_register')
  }

  // ── Cell render ──
  function renderCell(row:TxRow, col:ColDef){
    const key=`${row.id}__${col.key}`
    const isFlash=flashCells.has(key)
    const isEditing=editCell?.id===row.id&&editCell.col===col.key
    const val=(row as unknown as Record<string,unknown>)[col.key as string]

    let display:string
    if(col.key==='date') display=fmtDate(row.date)
    else if(['total_amount','paid_amount','swap_amount','difference'].includes(col.key as string)) display=fmtAmt(val as number|null)
    else display=String(val??'')

    const highlight = searchQuery && display.toLowerCase().includes(searchQuery.toLowerCase())

    if(isEditing){
      if(col.key==='remarks'){
        return (
          <select
            className="w-full bg-transparent text-xs outline-none border-0"
            value={editCell.value}
            onChange={e=>setEditCell(c=>c?{...c,value:e.target.value}:null)}
            onBlur={commitEdit}
            autoFocus
          >
            {REMARKS_OPTS.map(r=><option key={r}>{r}</option>)}
          </select>
        )
      }
      if(col.key==='commission_type'){
        return (
          <select
            className="w-full bg-transparent text-xs outline-none border-0"
            value={editCell.value}
            onChange={e=>setEditCell(c=>c?{...c,value:e.target.value}:null)}
            onBlur={commitEdit}
            autoFocus
          >
            {['Inclusive','Exclusive','Deferred'].map(t=><option key={t}>{t}</option>)}
          </select>
        )
      }
      return (
        <input
          ref={editRef}
          className="w-full bg-transparent text-xs outline-none border-0"
          style={{textAlign:'center'}}
          value={editCell.value}
          onChange={e=>setEditCell(c=>c?{...c,value:e.target.value}:null)}
          onBlur={commitEdit}
          onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditCell(null)}}
        />
      )
    }

    return (
      <span
        className="block truncate group-hover:text-[#1a1a1a]"
        style={{
          color: col.key==='remarks'?remarkColor(display):'inherit',
          textDecoration: display==='CANCEL'?'line-through':'none',
          background: isFlash?'#bbf7d0':highlight?'#fef08a':'transparent',
          transition:'background 0.4s',
          textAlign:'center',
        }}
      >
        {display||<span className="text-[#d1d5db]">—</span>}
      </span>
    )
  }

  const totalColWidth = COLS.reduce((s,c)=>s+(colWidths[c.key as string]||c.width),0)

  // ── Render ──
  const LeftPanel = () => (
    <div className="w-[220px] flex-shrink-0 border-r border-[#e5e7eb] bg-[#fafafa] flex flex-col">
      <div className="px-3 py-3 border-b border-[#e5e7eb]">
        <div className="text-xs font-bold text-[#1a1a1a] mb-2">Sheet Editor</div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[#6b7280]" style={{background:'#f3f4f6',border:'1px solid #e5e7eb'}}>
          <span className="text-[10px]">▾</span> schema: public
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {allLeftSheets.map(s=>(
          <button key={s.id} onClick={()=>openSheet(s.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#f0fdf4] transition-colors group relative"
            style={{borderLeft:activeSheet===s.id?'2px solid #3ECF8E':'2px solid transparent',background:activeSheet===s.id?'#f0fdf4':'transparent',color:activeSheet===s.id?'#065f46':'#374151'}}
          >
            <Table2 size={12} className="flex-shrink-0"/>
            <span className="truncate flex-1 text-left">{s.label}</span>
            {!s.ready&&<span className="text-[9px] px-1 py-0.5 rounded" style={{background:'#fef3c7',color:'#92400e'}}>Soon</span>}
            <Settings2 size={10} className="opacity-0 group-hover:opacity-100 flex-shrink-0" color="#9ca3af"/>
          </button>
        ))}
      </div>
    </div>
  )

  function sheetLabel(id: string) {
    return allLeftSheets.find(s => s.id === id)?.label ?? id
  }

  const TabBar = () => (
    <div className="flex items-center gap-0 border-b border-[#e5e7eb] bg-[#f3f4f6] overflow-x-auto">
      {openTabs.map(tid=>(
        <div key={tid} onClick={()=>setActiveSheet(tid)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-[#e5e7eb] whitespace-nowrap"
          style={{background:activeSheet===tid?'#fff':'transparent',borderBottom:activeSheet===tid?'2px solid #3ECF8E':'2px solid transparent',color:activeSheet===tid?'#1a1a1a':'#6b7280'}}
        >
          <Table2 size={11}/>{sheetLabel(tid)}
          <button className="ml-1 hover:bg-gray-200 rounded p-0.5" onClick={e=>closeTab(tid,e)}><X size={9}/></button>
        </div>
      ))}
    </div>
  )

  if(activeSheet==='ac_sheet') {
    return (
      <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
        <LeftPanel/>
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar/>
          <AcSheetView/>
        </div>
      </div>
    )
  }

  if(activeSheet==='cc_sheet') {
    return (
      <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
        <LeftPanel/>
        <div className="flex-1 flex flex-col">
          <TabBar/>
          <CCSheetView/>
        </div>
      </div>
    )
  }

  if(activeSheet==='chamunda_sheet') {
    return (
      <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
        <LeftPanel/>
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar/>
          <ChamundaSheetView/>
        </div>
      </div>
    )
  }

  if(activeSheet==='customer_sheet') {
    return (
      <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
        <LeftPanel/>
        <div className="flex-1 flex flex-col">
          <TabBar/>
          <CustomerSheetView/>
        </div>
      </div>
    )
  }

  if(activeSheet!=='daily_register') {
    const customSheet = customSheets.find(s => s.id === activeSheet)
    if (customSheet) {
      return (
        <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
          <LeftPanel/>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TabBar/>
            <CustomSheetView sheet={{...customSheet, themeColor: customSheet.themeColor ?? '#7F77DD'}}/>
          </div>
        </div>
      )
    }

    return (
      <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
        <LeftPanel/>
        <div className="flex-1 flex flex-col">
          <TabBar/>
          <ComingSoon name={sheetLabel(activeSheet)}/>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-48px)] gap-0 -mx-6 -mt-4">
      {/* ── LEFT PANEL ── */}
      <div className="w-[220px] flex-shrink-0 border-r border-[#e5e7eb] bg-[#fafafa] flex flex-col">
        <div className="px-3 py-3 border-b border-[#e5e7eb]">
          <div className="text-xs font-bold text-[#1a1a1a] mb-2">Sheet Editor</div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[#6b7280]" style={{background:'#f3f4f6',border:'1px solid #e5e7eb'}}>
            <span className="text-[10px]">▾</span> schema: public
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {allLeftSheets.map(s=>(
            <button key={s.id} onClick={()=>openSheet(s.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#f0fdf4] transition-colors group relative"
              style={{borderLeft:activeSheet===s.id?'2px solid #3ECF8E':'2px solid transparent',background:activeSheet===s.id?'#f0fdf4':'transparent',color:activeSheet===s.id?'#065f46':'#374151'}}
            >
              <Table2 size={12} className="flex-shrink-0"/>
              <span className="truncate flex-1 text-left">{s.label}</span>
              {!s.ready&&<span className="text-[9px] px-1 py-0.5 rounded" style={{background:'#fef3c7',color:'#92400e'}}>Soon</span>}
              <Settings2 size={10} className="opacity-0 group-hover:opacity-100 flex-shrink-0" color="#9ca3af"/>
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-[#e5e7eb] bg-[#f3f4f6] overflow-x-auto flex-shrink-0">
          {openTabs.map(tid=>(
            <div key={tid} onClick={()=>setActiveSheet(tid)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-[#e5e7eb] whitespace-nowrap"
              style={{background:activeSheet===tid?'#fff':'transparent',borderBottom:activeSheet===tid?'2px solid #3ECF8E':'2px solid transparent',color:activeSheet===tid?'#1a1a1a':'#6b7280'}}
            >
              <Table2 size={11}/>{sheetLabel(tid)}
              <button className="ml-1 hover:bg-gray-200 rounded p-0.5" onClick={e=>closeTab(tid,e)}><X size={9}/></button>
            </div>
          ))}
          <button className="px-2 py-2 text-[#9ca3af] hover:text-[#374151]" onClick={()=>{/* open sheet picker */}}><Plus size={13}/></button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb] bg-white flex-shrink-0">
          {/* Sort */}
          <div className="relative">
            <button onClick={()=>setShowSortDrop(v=>!v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium text-[#374151] hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>
              <ArrowUpDown size={12}/> Sort
            </button>
            {showSortDrop&&(
              <div className="absolute left-0 top-full mt-1 bg-white border rounded-md shadow-lg z-20" style={{borderColor:'#e5e7eb',width:180}}>
                {[{k:'sr_no' as keyof TxRow,l:'SR NO'},{k:'date' as keyof TxRow,l:'Date'},{k:'customer_name' as keyof TxRow,l:'Customer'},{k:'total_amount' as keyof TxRow,l:'Amount'}].map(({k,l})=>(
                  <button key={k} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-[#374151]"
                    onClick={()=>{if(sortKey===k)setSortAsc(v=>!v);else{setSortKey(k);setSortAsc(true)};setShowSortDrop(false)}}
                  >
                    {sortKey===k&&<span>{sortAsc?'↑':'↓'}</span>}
                    <span className={sortKey===k?'font-medium text-[#3ECF8E]':''}>{l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter */}
          <button onClick={()=>setShowFilter(v=>!v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50" style={{borderColor:showFilter?'#3ECF8E':'#e5e7eb',color:showFilter?'#3ECF8E':'#374151'}}>
            <SlidersHorizontal size={12}/> Filter {(filterFrom||filterTo||filterRemark!=='All'||filterCust)&&<span className="w-1.5 h-1.5 rounded-full bg-[#3ECF8E] inline-block"/>}
          </button>

          <button onClick={fetchAll} className="p-1.5 rounded border hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>
            <RefreshCw size={13} color="#6b7280"/>
          </button>

          {/* Realtime indicator */}
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{background:realtimeOk?'#3ECF8E':'#9ca3af'}}/>
            <span className="text-[10px] text-[#9ca3af]">{realtimeOk?'Live':'—'}</span>
          </div>

          {/* Search bar (Ctrl+F) */}
          {showSearch&&(
            <div className="flex items-center gap-1.5 rounded border px-2 py-1" style={{borderColor:'#3ECF8E'}}>
              <Search size={11} color="#9ca3af"/>
              <input ref={searchRef} className="text-xs outline-none w-36" placeholder="Search cells..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
              {searchQuery&&<span className="text-[10px] text-[#6b7280]">{filtered.length} rows</span>}
              <button onClick={()=>{setShowSearch(false);setSearchQuery('')}}><X size={10} color="#9ca3af"/></button>
            </div>
          )}

          <div className="flex-1"/>

          <button onClick={()=>setShowSearch(v=>!v)} className="p-1.5 rounded border hover:bg-gray-50" title="Ctrl+F" style={{borderColor:'#e5e7eb'}}>
            <Search size={13} color="#6b7280"/>
          </button>
          <button onClick={exportXlsx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium text-[#374151] hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>
            <Download size={12}/> Export .xlsx
          </button>
          <button onClick={()=>setShowInsert(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-white" style={{background:'#3ECF8E'}}>
            <Plus size={12}/> Insert Row
          </button>
        </div>

        {/* Filter panel */}
        {showFilter&&(
          <div className="px-3 py-2.5 border-b border-[#e5e7eb] bg-[#fafafa] flex flex-wrap items-end gap-3 flex-shrink-0">
            <div><div className="text-[10px] font-medium text-[#6b7280] mb-1">Date From</div><input type="date" className="rounded border px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]" style={{borderColor:'#e5e7eb'}} value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/></div>
            <div><div className="text-[10px] font-medium text-[#6b7280] mb-1">Date To</div><input type="date" className="rounded border px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]" style={{borderColor:'#e5e7eb'}} value={filterTo} onChange={e=>setFilterTo(e.target.value)}/></div>
            <div>
              <div className="text-[10px] font-medium text-[#6b7280] mb-1">Remarks</div>
              <select className="rounded border px-2 py-1 text-xs outline-none bg-white" style={{borderColor:'#e5e7eb'}} value={filterRemark} onChange={e=>setFilterRemark(e.target.value)}>
                <option>All</option>{REMARKS_OPTS.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div><div className="text-[10px] font-medium text-[#6b7280] mb-1">Customer</div><input className="rounded border px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]" style={{borderColor:'#e5e7eb'}} placeholder="Search name..." value={filterCust} onChange={e=>setFilterCust(e.target.value)}/></div>
            <button onClick={()=>{setFilterFrom('');setFilterTo('');setFilterRemark('All');setFilterCust('')}} className="px-2.5 py-1.5 rounded border text-xs text-[#6b7280] hover:bg-gray-50" style={{borderColor:'#e5e7eb'}}>Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto" style={{fontFamily:'Calibri, Arial, sans-serif',fontSize:13}}>
          {loading?(
            <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
          ):(<SheetTable
              dateGroups={dateGroups}
              flashCells={flashCells}
              editCell={editCell}
              renderCell={renderCell}
              startEdit={startEdit}
              COLS={COLS}
            />)}
        </div>

        {/* Summary row */}
        {viewMode==='summary'&&(
          <div className="border-t border-[#e5e7eb] px-3 py-2 bg-[#f0fdf4] flex gap-6 text-xs flex-shrink-0">
            <span><strong>Total:</strong> ₹{summary.total.toLocaleString('en-IN')}</span>
            <span><strong>Paid Amt:</strong> ₹{summary.paid.toLocaleString('en-IN')}</span>
            <span><strong>Swap:</strong> ₹{summary.swap.toLocaleString('en-IN')}</span>
            <span><strong className="text-green-600">PAID:</strong> {summary.paidCount}</span>
            <span><strong className="text-yellow-600">PEND:</strong> {summary.pendCount}</span>
            <span><strong className="text-blue-600">PURU:</strong> {summary.puruCount}</span>
          </div>
        )}

        {/* Month tabs */}
        <div className="border-t border-[#e5e7eb] bg-[#f9f9f9] overflow-x-auto flex-shrink-0">
          <div className="flex items-center min-w-max">
            {/* ALL tab */}
            <button onClick={()=>{setActiveMonthKey('all');setPage(1)}}
              className="px-3 py-1.5 text-[11px] font-medium border-r border-[#e5e7eb] whitespace-nowrap transition-colors"
              style={{background:activeMonthKey==='all'?'#fff':'transparent',borderBottom:activeMonthKey==='all'?'2px solid #3ECF8E':'2px solid transparent',color:activeMonthKey==='all'?'#1a1a1a':'#6b7280',fontWeight:activeMonthKey==='all'?'600':'400'}}
            >
              ALL <span className="ml-1 text-[9px] text-[#9ca3af]">({allRows.length})</span>
            </button>
            {monthTabs.map(t=>(
              <button key={t.key} onClick={()=>{setActiveMonthKey(t.key);setPage(1)}}
                className="px-3 py-1.5 text-[11px] font-medium border-r border-[#e5e7eb] whitespace-nowrap transition-colors"
                style={{background:activeMonthKey===t.key?'#fff':'transparent',borderBottom:activeMonthKey===t.key?'2px solid #3ECF8E':'2px solid transparent',color:activeMonthKey===t.key?'#1a1a1a':'#6b7280',fontWeight:activeMonthKey===t.key?'600':'400'}}
              >
                {t.label} <span className="ml-1 text-[9px] text-[#9ca3af]">({t.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#e5e7eb] bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={14}/></button>
            <span className="text-xs text-[#374151]">Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={14}/></button>
            <select className="text-xs border rounded px-1.5 py-0.5 outline-none bg-white" style={{borderColor:'#e5e7eb'}} value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>
              {PAGE_SIZES.map(s=><option key={s} value={s}>{s} rows</option>)}
            </select>
          </div>
          <span className="text-xs text-[#6b7280]">{filtered.length} records</span>
          <div className="flex items-center gap-1">
            {(['data','summary'] as const).map(v=>(
              <button key={v} onClick={()=>setViewMode(v)} className="px-2.5 py-1 text-xs rounded capitalize" style={{background:viewMode===v?'#3ECF8E':undefined,color:viewMode===v?'#fff':'#6b7280',fontWeight:viewMode===v?'600':'400'}}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Insert panel */}
      {showInsert&&<InsertPanel onClose={()=>setShowInsert(false)} onInserted={()=>{
        const now=new Date(); setActiveMonthKey(`${now.getFullYear()}-${now.getMonth()+1}`)
        fetchAll()
      }}/>}
    </div>
  )
}
