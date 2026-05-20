'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldMappingRule = {
  formFieldId: string
  formFieldLabel: string
  sheetId: string
  sheetLabel: string
  columnId: string
  columnLabel: string
}

export type ConditionOperator = '+' | '-' | '*' | '/' | '='

export type ColumnCondition = {
  id: string
  sheetId: string
  targetColumnId: string
  targetColumnLabel: string
  leftColumnId: string
  leftColumnLabel: string
  operator: ConditionOperator
  rightType: 'column' | 'constant'
  rightColumnId?: string
  rightColumnLabel?: string
  rightConstant?: number
}

export type MappingState = {
  rules: FieldMappingRule[]
  conditions: ColumnCondition[]
  lastUpdated: string
  version: number
}

interface FormField {
  id: string
  label: string
  type: string
  isCustom?: boolean
}

interface SheetColumn {
  id: string
  label: string
  isCustom?: boolean
}

interface Sheet {
  id: string
  label: string
  themeColor?: string
  columns: SheetColumn[]
  isCustom?: boolean
}

interface FieldMappingEditorProps {
  formFields: FormField[]
  sheets: Sheet[]
  initialMappings?: MappingState
  onMappingsChange: (mappings: MappingState) => void
  // Optional Supabase callbacks — when provided, custom data is persisted to DB
  // instead of localStorage
  onAddSheet?: (label: string, themeColor: string) => Promise<string | undefined>
  onAddColumn?: (sheetId: string, label: string) => Promise<string | undefined>
  onDeleteSheet?: (sheetId: string) => Promise<void>
  onDeleteColumn?: (sheetId: string, columnId: string) => Promise<void>
  onRenameSheet?: (sheetId: string, newLabel: string) => Promise<void>
}

type Pos = { x: number; y: number }

type DragState = {
  fieldId: string
  startPos: Pos
  currentPos: Pos
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_COLORS = [
  '#7F77DD', '#1D9E75', '#BA7517', '#D85A30',
  '#378ADD', '#D4537E', '#639922', '#888780',
]

const FIELD_TYPES = ['text', 'number', 'select', 'date', 'checkbox']

const NS = 'http://www.w3.org/2000/svg'

// ─── Utilities ────────────────────────────────────────────────────────────────

export function migrateOldMappings(old: unknown): MappingState {
  if (
    old &&
    typeof old === 'object' &&
    'rules' in old &&
    Array.isArray((old as MappingState).rules)
  ) {
    const s = old as MappingState
    return { ...s, conditions: s.conditions ?? [] }
  }
  return { rules: [], conditions: [], lastUpdated: new Date().toISOString(), version: 1 }
}

export function applyMappingsToSheets(
  formData: Record<string, unknown>,
  mappings: MappingState
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}

  // 1. Direct field → column mappings
  for (const rule of mappings.rules) {
    if (!result[rule.sheetId]) result[rule.sheetId] = {}
    result[rule.sheetId][rule.columnId] = formData[rule.formFieldId]
  }

  // 2. Column conditions (colC = colA op colB | constant)
  for (const cond of (mappings.conditions ?? [])) {
    if (!result[cond.sheetId]) result[cond.sheetId] = {}
    const left = Number(result[cond.sheetId][cond.leftColumnId] ?? 0)
    const right = cond.rightType === 'constant'
      ? (cond.rightConstant ?? 0)
      : Number(result[cond.sheetId][cond.rightColumnId ?? ''] ?? 0)

    let value: number | unknown = 0
    switch (cond.operator) {
      case '+': value = left + right; break
      case '-': value = left - right; break
      case '*': value = left * right; break
      case '/': value = right !== 0 ? left / right : 0; break
      case '=': value = result[cond.sheetId][cond.leftColumnId]; break
    }
    result[cond.sheetId][cond.targetColumnId] = value
  }

  return result
}

function makeId(label: string) {
  return `custom_${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FieldMappingEditor({
  formFields,
  sheets,
  initialMappings,
  onMappingsChange,
  onAddSheet,
  onAddColumn,
  onDeleteSheet,
  onDeleteColumn,
  onRenameSheet,
}: FieldMappingEditorProps) {
  // When Supabase callbacks are provided, skip localStorage for custom data
  const useSupabase = !!onAddSheet
  // ── Core state (unchanged from original) ──────────────────────────────────
  const [activeSheetId, setActiveSheetId] = useState(sheets[0]?.id ?? '')
  const [rules, setRules] = useState<FieldMappingRule[]>(() =>
    migrateOldMappings(
      initialMappings ?? { rules: [], lastUpdated: '', version: 0 }
    ).rules
  )
  const [savedFlash, setSavedFlash] = useState(false)
  const [dragging, setDragging] = useState<DragState | null>(null)

  // ── Column conditions ─────────────────────────────────────────────────────
  const [conditions, setConditions] = useState<ColumnCondition[]>(() =>
    (initialMappings?.conditions ?? [])
  )
  const [fxColumnId, setFxColumnId] = useState<string | null>(null)
  // Draft state for the condition editor
  const [fxDraft, setFxDraft] = useState<Partial<ColumnCondition>>({
    operator: '+', rightType: 'column',
  })

  // ── Custom data state ─────────────────────────────────────────────────────
  const [customFields, setCustomFields] = useState<FormField[]>([])
  const [customSheets, setCustomSheets] = useState<Sheet[]>([])
  const [customColsBySheet, setCustomColsBySheet] = useState<Record<string, SheetColumn[]>>({})

  // ── Add field UI ──────────────────────────────────────────────────────────
  const [addFieldLabel, setAddFieldLabel] = useState('')
  const [addFieldType, setAddFieldType] = useState('text')
  const [addFieldError, setAddFieldError] = useState('')

  // ── Add column UI ─────────────────────────────────────────────────────────
  const [addColLabel, setAddColLabel] = useState('')
  const [addColError, setAddColError] = useState('')
  const addColInputRef = useRef<HTMLInputElement>(null)

  // ── Add sheet UI ──────────────────────────────────────────────────────────
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [addSheetName, setAddSheetName] = useState('')
  const [addSheetColor, setAddSheetColor] = useState(SHEET_COLORS[0])
  const [addSheetError, setAddSheetError] = useState('')

  // ── Sheet settings (rename / delete) ─────────────────────────────────────
  const [sheetMenuId, setSheetMenuId] = useState<string | null>(null)
  const [sheetMenuPos, setSheetMenuPos] = useState({ x: 0, y: 0 })
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const sheetGearRefs = useRef<Map<string, HTMLElement>>(new Map())

  // ── Animation ─────────────────────────────────────────────────────────────
  const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set())

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const leftHandleRefs = useRef<Map<string, HTMLElement>>(new Map())
  const rightHandleRefs = useRef<Map<string, HTMLElement>>(new Map())
  const rafRef = useRef<number | null>(null)

  // ── Merged data ───────────────────────────────────────────────────────────
  const allFields: FormField[] = [...formFields, ...customFields]

  const allSheets: Sheet[] = [...sheets, ...customSheets].map(s => ({
    ...s,
    columns: [...s.columns, ...(customColsBySheet[s.id] ?? [])],
  }))

  // ── Shadow refs (so callbacks stay stable without stale closures) ─────────
  const rulesRef = useRef(rules)
  rulesRef.current = rules
  const activeSheetIdRef = useRef(activeSheetId)
  activeSheetIdRef.current = activeSheetId
  const draggingRef = useRef(dragging)
  draggingRef.current = dragging
  const versionRef = useRef(initialMappings?.version ?? 0)
  const allFieldsRef = useRef(allFields)
  allFieldsRef.current = allFields
  const allSheetsRef = useRef(allSheets)
  allSheetsRef.current = allSheets

  const activeSheet = allSheets.find(s => s.id === activeSheetId)
  const themeColor = activeSheet?.themeColor ?? '#3ECF8E'
  const themeColorRef = useRef(themeColor)
  themeColorRef.current = themeColor

  // ── Load custom data from localStorage on mount (only without Supabase) ──
  useEffect(() => {
    if (useSupabase) return  // parent manages custom sheets via DB
    try {
      const f = localStorage.getItem('field_mapping_custom_fields')
      if (f) setCustomFields(JSON.parse(f))
      const s = localStorage.getItem('field_mapping_custom_sheets')
      if (s) setCustomSheets(JSON.parse(s))
      const c = localStorage.getItem('field_mapping_custom_cols')
      if (c) setCustomColsBySheet(JSON.parse(c))
    } catch { /* ignore */ }
  }, [useSupabase])

  // Ensure activeSheetId stays valid
  useEffect(() => {
    const all = [...sheets, ...customSheets]
    if (all.length > 0 && !all.find(s => s.id === activeSheetId)) {
      setActiveSheetId(all[0].id)
    }
  }, [sheets, customSheets, activeSheetId])

  // Close sheet menu on outside click
  useEffect(() => {
    if (!sheetMenuId) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-sheet-menu]')) setSheetMenuId(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [sheetMenuId])

  // ── Persist custom data ───────────────────────────────────────────────────
  function persistCustom(
    fields: FormField[],
    sheets: Sheet[],
    cols: Record<string, SheetColumn[]>
  ) {
    try {
      localStorage.setItem('field_mapping_custom_fields', JSON.stringify(fields))
      localStorage.setItem('field_mapping_custom_sheets', JSON.stringify(sheets))
      localStorage.setItem('field_mapping_custom_cols', JSON.stringify(cols))
    } catch { /* quota exceeded – ignore */ }
  }

  // ── Animation helper ──────────────────────────────────────────────────────
  function markNew(id: string) {
    setNewNodeIds(prev => { const s = new Set(prev); s.add(id); return s })
    setTimeout(() => {
      setNewNodeIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 300)
  }

  // Shadow ref so saveConditions can read latest conditions
  const conditionsRef = useRef(conditions)
  conditionsRef.current = conditions

  // ── Save rules ────────────────────────────────────────────────────────────
  const saveRules = useCallback(
    (newRules: FieldMappingRule[], newConditions?: ColumnCondition[]) => {
      versionRef.current += 1
      const state: MappingState = {
        rules: newRules,
        conditions: newConditions ?? conditionsRef.current,
        lastUpdated: new Date().toISOString(),
        version: versionRef.current,
      }
      onMappingsChange(state)
      try {
        localStorage.setItem('field_mapping_rules', JSON.stringify(state))
      } catch { /* quota exceeded – ignore */ }
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    },
    [onMappingsChange]
  )

  const saveConditions = useCallback(
    (newConditions: ColumnCondition[]) => {
      setConditions(newConditions)
      saveRules(rulesRef.current, newConditions)
    },
    [saveRules]
  )

  // ── SVG drawing (unchanged) ───────────────────────────────────────────────
  const getHandlePos = useCallback((el: HTMLElement): Pos | null => {
    if (!wrapperRef.current) return null
    const wRect = wrapperRef.current.getBoundingClientRect()
    const hRect = el.getBoundingClientRect()
    return {
      x: hRect.left + hRect.width / 2 - wRect.left,
      y: hRect.top + hRect.height / 2 - wRect.top,
    }
  }, [])

  const drawSVG = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const color = themeColorRef.current
    const drag = draggingRef.current
    const activeId = activeSheetIdRef.current

    for (const rule of rulesRef.current) {
      if (rule.sheetId !== activeId) continue
      const leftEl = leftHandleRefs.current.get(rule.formFieldId)
      const rightEl = rightHandleRefs.current.get(rule.columnId)
      if (!leftEl || !rightEl) continue
      const lp = getHandlePos(leftEl)
      const rp = getHandlePos(rightEl)
      if (!lp || !rp) continue

      const mid = (lp.x + rp.x) / 2
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', `M ${lp.x} ${lp.y} C ${mid} ${lp.y} ${mid} ${rp.y} ${rp.x} ${rp.y}`)
      path.setAttribute('stroke', color)
      path.setAttribute('stroke-width', '2')
      path.setAttribute('fill', 'none')
      svg.appendChild(path)

      for (const p of [lp, rp]) {
        const c = document.createElementNS(NS, 'circle')
        c.setAttribute('cx', String(p.x))
        c.setAttribute('cy', String(p.y))
        c.setAttribute('r', '4')
        c.setAttribute('fill', color)
        svg.appendChild(c)
      }
    }

    if (drag) {
      const mid = (drag.startPos.x + drag.currentPos.x) / 2
      const path = document.createElementNS(NS, 'path')
      path.setAttribute(
        'd',
        `M ${drag.startPos.x} ${drag.startPos.y} C ${mid} ${drag.startPos.y} ${mid} ${drag.currentPos.y} ${drag.currentPos.x} ${drag.currentPos.y}`
      )
      path.setAttribute('stroke', '#534AB7')
      path.setAttribute('stroke-width', '2')
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke-dasharray', '5 4')
      svg.appendChild(path)

      const c = document.createElementNS(NS, 'circle')
      c.setAttribute('cx', String(drag.startPos.x))
      c.setAttribute('cy', String(drag.startPos.y))
      c.setAttribute('r', '4')
      c.setAttribute('fill', '#534AB7')
      svg.appendChild(c)
    }
  }, [getHandlePos])

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      drawSVG()
      rafRef.current = null
    })
  }, [drawSVG])

  useEffect(() => { scheduleRedraw() }, [rules, activeSheetId, dragging, scheduleRedraw])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const ro = new ResizeObserver(scheduleRedraw)
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [scheduleRedraw])

  useEffect(() => {
    const lp = leftPanelRef.current
    const rp = rightPanelRef.current
    if (!lp || !rp) return
    lp.addEventListener('scroll', scheduleRedraw)
    rp.addEventListener('scroll', scheduleRedraw)
    return () => {
      lp.removeEventListener('scroll', scheduleRedraw)
      rp.removeEventListener('scroll', scheduleRedraw)
    }
  }, [scheduleRedraw])

  // ── Global mouse / touch (uses refs, no stale closure on sheets/formFields) ──
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!draggingRef.current || !wrapperRef.current) return
      const wRect = wrapperRef.current.getBoundingClientRect()
      const clientX = e instanceof TouchEvent ? (e.touches[0]?.clientX ?? 0) : e.clientX
      const clientY = e instanceof TouchEvent ? (e.touches[0]?.clientY ?? 0) : e.clientY
      setDragging(d =>
        d ? { ...d, currentPos: { x: clientX - wRect.left, y: clientY - wRect.top } } : null
      )
    }

    const onUp = (e: MouseEvent | TouchEvent) => {
      const drag = draggingRef.current
      if (!drag) return

      const clientX =
        e instanceof TouchEvent ? (e.changedTouches[0]?.clientX ?? 0) : (e as MouseEvent).clientX
      const clientY =
        e instanceof TouchEvent ? (e.changedTouches[0]?.clientY ?? 0) : (e as MouseEvent).clientY

      let hitColumnId: string | null = null
      rightHandleRefs.current.forEach((el, colId) => {
        if (hitColumnId) return
        const rect = el.getBoundingClientRect()
        if (
          clientX >= rect.left - 10 &&
          clientX <= rect.right + 10 &&
          clientY >= rect.top - 10 &&
          clientY <= rect.bottom + 10
        ) {
          hitColumnId = colId
        }
      })

      if (hitColumnId) {
        const sid = activeSheetIdRef.current
        const sheet = allSheetsRef.current.find(s => s.id === sid)
        const hitCol = sheet?.columns.find(c => c.id === hitColumnId)
        const hitField = allFieldsRef.current.find(f => f.id === drag.fieldId)
        if (hitCol && hitField && sheet) {
          const newRules = rulesRef.current.filter(
            r =>
              !(r.formFieldId === drag.fieldId && r.sheetId === sid) &&
              !(r.columnId === hitColumnId && r.sheetId === sid)
          )
          newRules.push({
            formFieldId: hitField.id,
            formFieldLabel: hitField.label,
            sheetId: sid,
            sheetLabel: sheet.label,
            columnId: hitCol.id,
            columnLabel: hitCol.label,
          })
          setRules(newRules)
          saveRules(newRules)
        }
      }

      setDragging(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [saveRules]) // no longer needs sheets/formFields — reads from refs

  // ── Drag start handlers (unchanged) ──────────────────────────────────────
  function startDragFromLeft(e: React.MouseEvent | React.TouchEvent, fieldId: string) {
    e.preventDefault()
    const el = leftHandleRefs.current.get(fieldId)
    if (!el || !wrapperRef.current) return
    const pos = getHandlePos(el)
    if (!pos) return
    const wRect = wrapperRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    setDragging({
      fieldId,
      startPos: pos,
      currentPos: { x: clientX - wRect.left, y: clientY - wRect.top },
    })
  }

  function startDragFromRight(e: React.MouseEvent | React.TouchEvent, columnId: string) {
    e.preventDefault()
    const rule = rules.find(r => r.columnId === columnId && r.sheetId === activeSheetId)
    if (!rule) return
    const el = rightHandleRefs.current.get(columnId)
    if (!el || !wrapperRef.current) return
    const pos = getHandlePos(el)
    if (!pos) return

    const newRules = rules.filter(
      r => !(r.columnId === columnId && r.sheetId === activeSheetId)
    )
    setRules(newRules)
    saveRules(newRules)

    const wRect = wrapperRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    setDragging({
      fieldId: rule.formFieldId,
      startPos: pos,
      currentPos: { x: clientX - wRect.left, y: clientY - wRect.top },
    })
  }

  // ── Controls (autoMap updated to use allFields/allSheets) ────────────────
  function autoMap() {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const updated = [...rules]
    for (const field of allFields) {
      if (!activeSheet) break
      const nf = normalize(field.label)
      for (const col of activeSheet.columns) {
        const nc = normalize(col.label)
        if (nf === nc || nf.includes(nc) || nc.includes(nf)) {
          if (updated.some(r => r.formFieldId === field.id && r.sheetId === activeSheetId)) break
          const filtered = updated.filter(
            r => !(r.columnId === col.id && r.sheetId === activeSheetId)
          )
          filtered.push({
            formFieldId: field.id,
            formFieldLabel: field.label,
            sheetId: activeSheetId,
            sheetLabel: activeSheet.label,
            columnId: col.id,
            columnLabel: col.label,
          })
          updated.length = 0
          filtered.forEach(r => updated.push(r))
          break
        }
      }
    }
    setRules(updated)
    saveRules(updated)
  }

  function clearSheet() {
    const n = rules.filter(r => r.sheetId !== activeSheetId)
    setRules(n)
    saveRules(n)
  }

  function clearAll() {
    if (!confirm('This will remove all mappings across all sheets. Continue?')) return
    setRules([])
    saveRules([])
  }

  // ── Custom field handlers ─────────────────────────────────────────────────
  function handleAddField() {
    const label = addFieldLabel.trim()
    if (!label) {
      setAddFieldError('Field name required')
      setTimeout(() => setAddFieldError(''), 2000)
      return
    }
    if (allFields.some(f => f.label.toLowerCase() === label.toLowerCase())) {
      setAddFieldError('Field already exists')
      setTimeout(() => setAddFieldError(''), 2000)
      return
    }
    const id = makeId(label)
    const newField: FormField = { id, label, type: addFieldType, isCustom: true }
    const updated = [...customFields, newField]
    setCustomFields(updated)
    persistCustom(updated, customSheets, customColsBySheet)
    setAddFieldLabel('')
    markNew(id)
  }

  function handleDeleteField(fieldId: string) {
    const updated = customFields.filter(f => f.id !== fieldId)
    setCustomFields(updated)
    persistCustom(updated, customSheets, customColsBySheet)
    const updatedRules = rules.filter(r => r.formFieldId !== fieldId)
    if (updatedRules.length !== rules.length) {
      setRules(updatedRules)
      saveRules(updatedRules)
    }
  }

  // ── Custom column handlers ────────────────────────────────────────────────
  function handleAddColumn() {
    const label = addColLabel.trim()
    if (!label) {
      setAddColError('Column name required')
      setTimeout(() => setAddColError(''), 2000)
      return
    }
    const cols = activeSheet?.columns ?? []
    if (cols.some(c => c.label.toLowerCase() === label.toLowerCase())) {
      setAddColError('Column already exists')
      setTimeout(() => setAddColError(''), 2000)
      return
    }
    setAddColLabel('')

    if (useSupabase && onAddColumn) {
      onAddColumn(activeSheetId, label).then(colKey => {
        if (colKey) {
          markNew(colKey)
        } else {
          setAddColError('Failed to save column — check console for details')
          setTimeout(() => setAddColError(''), 4000)
        }
      })
      return
    }

    const id = makeId(label)
    const newCol: SheetColumn = { id, label, isCustom: true }
    const updated = {
      ...customColsBySheet,
      [activeSheetId]: [...(customColsBySheet[activeSheetId] ?? []), newCol],
    }
    setCustomColsBySheet(updated)
    persistCustom(customFields, customSheets, updated)
    markNew(id)
  }

  function handleDeleteColumn(colId: string) {
    const updatedRules = rules.filter(r => r.columnId !== colId)
    if (updatedRules.length !== rules.length) {
      setRules(updatedRules)
      saveRules(updatedRules)
    }

    if (useSupabase && onDeleteColumn) {
      onDeleteColumn(activeSheetId, colId)
      return
    }

    const updated: Record<string, SheetColumn[]> = {}
    Object.keys(customColsBySheet).forEach(sid => {
      updated[sid] = customColsBySheet[sid].filter(c => c.id !== colId)
    })
    setCustomColsBySheet(updated)
    persistCustom(customFields, customSheets, updated)
  }

  // ── Custom sheet handlers ─────────────────────────────────────────────────
  function handleCreateSheet() {
    const name = addSheetName.trim()
    if (!name) {
      setAddSheetError('Sheet name required')
      setTimeout(() => setAddSheetError(''), 2000)
      return
    }
    if (allSheets.some(s => s.label.toLowerCase() === name.toLowerCase())) {
      setAddSheetError('Sheet already exists')
      setTimeout(() => setAddSheetError(''), 2000)
      return
    }
    setShowAddSheet(false)
    setAddSheetName('')

    if (useSupabase && onAddSheet) {
      onAddSheet(name, addSheetColor).then(sheetKey => {
        if (sheetKey) {
          setActiveSheetId(sheetKey)
          setTimeout(() => addColInputRef.current?.focus(), 80)
        }
      })
      return
    }

    const id = makeId(name)
    const newSheet: Sheet = { id, label: name, themeColor: addSheetColor, columns: [], isCustom: true }
    const updated = [...customSheets, newSheet]
    setCustomSheets(updated)
    persistCustom(customFields, updated, customColsBySheet)
    setActiveSheetId(id)
    setTimeout(() => addColInputRef.current?.focus(), 80)
  }

  function openSheetMenu(sheetId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const el = sheetGearRefs.current.get(sheetId)
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSheetMenuPos({ x: rect.left, y: rect.bottom + 4 })
    setSheetMenuId(prev => (prev === sheetId ? null : sheetId))
  }

  function handleDeleteSheet(sheetId: string) {
    const sheet = allSheets.find(s => s.id === sheetId)
    if (!sheet) return
    if (!confirm(`Delete "${sheet.label}" and all its mappings?`)) return
    setSheetMenuId(null)

    const updatedRules = rules.filter(r => r.sheetId !== sheetId)
    if (updatedRules.length !== rules.length) {
      setRules(updatedRules)
      saveRules(updatedRules)
    }
    if (activeSheetId === sheetId) {
      const remaining = allSheets.filter(s => s.id !== sheetId)
      if (remaining.length > 0) setActiveSheetId(remaining[0].id)
    }

    if (useSupabase && onDeleteSheet) {
      onDeleteSheet(sheetId)
      return
    }

    const updatedSheets = customSheets.filter(s => s.id !== sheetId)
    const updatedCols = { ...customColsBySheet }
    delete updatedCols[sheetId]
    setCustomSheets(updatedSheets)
    setCustomColsBySheet(updatedCols)
    persistCustom(customFields, updatedSheets, updatedCols)
  }

  function startRenaming(sheetId: string) {
    const sheet = customSheets.find(s => s.id === sheetId)
    if (!sheet) return
    setRenameValue(sheet.label)
    setRenamingSheetId(sheetId)
    setSheetMenuId(null)
  }

  function commitRename(sheetId: string) {
    const label = renameValue.trim()
    setRenamingSheetId(null)
    if (!label) return

    const updatedRules = rules.map(r =>
      r.sheetId === sheetId ? { ...r, sheetLabel: label } : r
    )
    setRules(updatedRules)
    saveRules(updatedRules)

    if (useSupabase && onRenameSheet) {
      onRenameSheet(sheetId, label)
      return
    }

    const updatedSheets = customSheets.map(s =>
      s.id === sheetId ? { ...s, label } : s
    )
    setCustomSheets(updatedSheets)
    persistCustom(customFields, updatedSheets, customColsBySheet)
  }

  // ── Condition helpers ─────────────────────────────────────────────────────
  function openConditionEditor(colId: string) {
    if (fxColumnId === colId) { setFxColumnId(null); return }
    const existing = conditions.find(
      c => c.sheetId === activeSheetId && c.targetColumnId === colId
    )
    setFxDraft(existing
      ? { ...existing }
      : { operator: '+', rightType: 'column' }
    )
    setFxColumnId(colId)
  }

  function saveCondition(targetCol: { id: string; label: string }) {
    if (!fxDraft.leftColumnId) return
    const isRightOk = fxDraft.rightType === 'constant'
      ? fxDraft.rightConstant !== undefined
      : !!fxDraft.rightColumnId

    if (!isRightOk) return

    const newCond: ColumnCondition = {
      id: `cond_${activeSheetId}_${targetCol.id}`,
      sheetId: activeSheetId,
      targetColumnId: targetCol.id,
      targetColumnLabel: targetCol.label,
      leftColumnId: fxDraft.leftColumnId!,
      leftColumnLabel: fxDraft.leftColumnLabel ?? '',
      operator: fxDraft.operator ?? '+',
      rightType: fxDraft.rightType ?? 'column',
      rightColumnId: fxDraft.rightType === 'column' ? fxDraft.rightColumnId : undefined,
      rightColumnLabel: fxDraft.rightType === 'column' ? fxDraft.rightColumnLabel : undefined,
      rightConstant: fxDraft.rightType === 'constant' ? fxDraft.rightConstant : undefined,
    }

    const updated = [
      ...conditions.filter(c => c.id !== newCond.id),
      newCond,
    ]
    saveConditions(updated)
    setFxColumnId(null)
  }

  function deleteCondition(targetColumnId: string) {
    saveConditions(
      conditions.filter(
        c => !(c.sheetId === activeSheetId && c.targetColumnId === targetColumnId)
      )
    )
    setFxColumnId(null)
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const activeRules = rules.filter(r => r.sheetId === activeSheetId)
  const mappedFieldCount = new Set(rules.map(r => r.formFieldId)).size
  const sheetsWithMappings = new Set(rules.map(r => r.sheetId)).size
  const totalConnections = rules.length

  // Pick a default color for new sheets (first unused)
  const usedColors = new Set(allSheets.map(s => s.themeColor))
  const defaultNewSheetColor = SHEET_COLORS.find(c => !usedColors.has(c)) ?? SHEET_COLORS[0]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Keyframe for node appear animation */}
      <style>{`
        @keyframes fme-slide-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* Sheet settings popover (fixed-position) */}
      {sheetMenuId && (
        <div
          data-sheet-menu
          style={{
            position: 'fixed',
            top: sheetMenuPos.y,
            left: sheetMenuPos.x,
            zIndex: 200,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
            padding: '4px 0',
            minWidth: 148,
          }}
        >
          <button
            onClick={() => startRenaming(sheetMenuId)}
            className="w-full text-left px-4 py-2 text-xs font-medium transition-colors"
            style={{ color: '#374151' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ✏️ Rename
          </button>
          <button
            onClick={() => handleDeleteSheet(sheetMenuId)}
            className="w-full text-left px-4 py-2 text-xs font-medium transition-colors"
            style={{ color: '#ef4444' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            🗑️ Delete sheet
          </button>
        </div>
      )}

      <div
        className="flex flex-col bg-white rounded-xl overflow-hidden"
        style={{ border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', height: '100%' }}
      >
        {/* ── TOOLBAR ── */}
        <div
          style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}
        >
          {/* Tab row */}
          <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto flex-1" style={{ minWidth: 0 }}>
              {allSheets.map(sheet => {
                const count = rules.filter(r => r.sheetId === sheet.id).length
                const isActive = sheet.id === activeSheetId
                const color = sheet.themeColor ?? '#6b7280'
                const isCustomSheet = sheet.isCustom === true
                const isRenaming = renamingSheetId === sheet.id

                return (
                  <div key={sheet.id} className="relative flex items-center" style={{ flexShrink: 0 }}>
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(sheet.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(sheet.id)
                          if (e.key === 'Escape') setRenamingSheetId(null)
                        }}
                        className="px-2 py-1 text-xs rounded-lg outline-none"
                        style={{ border: `1px solid ${color}`, color, minWidth: 80, maxWidth: 160 }}
                      />
                    ) : (
                      <button
                        onClick={() => setActiveSheetId(sheet.id)}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
                        style={{
                          background: isActive ? color + '18' : 'white',
                          border: `1px solid ${isActive ? color : '#e5e7eb'}`,
                          color: isActive ? color : '#6b7280',
                        }}
                      >
                        {sheet.label}
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isActive ? color : '#e5e7eb',
                            color: isActive ? 'white' : '#6b7280',
                          }}
                        >
                          {count}/{sheet.columns.length}
                        </span>
                        {isCustomSheet && (
                          <span
                            ref={el => {
                              if (el) sheetGearRefs.current.set(sheet.id, el)
                              else sheetGearRefs.current.delete(sheet.id)
                            }}
                            data-sheet-menu
                            onClick={e => openSheetMenu(sheet.id, e)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-[11px] cursor-pointer rounded px-0.5"
                            style={{ color: '#9ca3af' }}
                            title="Sheet settings"
                          >
                            ⚙
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )
              })}

              {/* + Add sheet button */}
              <button
                onClick={() => {
                  setShowAddSheet(v => !v)
                  setAddSheetColor(defaultNewSheetColor)
                  setAddSheetName('')
                  setAddSheetError('')
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
                style={{
                  border: '1px dashed #d1d5db',
                  color: '#9ca3af',
                  background: showAddSheet ? '#f9fafb' : 'transparent',
                  flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#6b7280')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
              >
                + Add sheet
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium hidden sm:inline" style={{ color: '#9ca3af' }}>
                {totalConnections} connection{totalConnections !== 1 ? 's' : ''}
              </span>
              <button
                onClick={autoMap}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition"
                style={{ border: '1px solid #bfdbfe', color: '#2563eb', background: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                Auto-map
              </button>
              <button
                onClick={clearSheet}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition"
                style={{ border: '1px solid #e5e7eb', color: '#6b7280', background: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                Clear sheet
              </button>
              <button
                onClick={clearAll}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition"
                style={{ border: '1px solid #fecaca', color: '#ef4444', background: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Inline add-sheet form */}
          {showAddSheet && (
            <div
              className="px-4 pb-3 flex flex-col gap-2"
              style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  autoFocus
                  value={addSheetName}
                  onChange={e => setAddSheetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateSheet() }}
                  placeholder="Sheet name..."
                  className="px-2.5 py-1.5 text-xs rounded-lg outline-none"
                  style={{ border: '1px solid #d1d5db', color: '#111827', minWidth: 160 }}
                />
                <div className="flex items-center gap-1">
                  {SHEET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setAddSheetColor(c)}
                      title={c}
                      className="w-5 h-5 rounded-full transition-transform"
                      style={{
                        background: c,
                        outline: addSheetColor === c ? `2px solid ${c}` : 'none',
                        outlineOffset: 2,
                        transform: addSheetColor === c ? 'scale(1.2)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>
              {addSheetError && (
                <span className="text-[10px]" style={{ color: '#ef4444' }}>{addSheetError}</span>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateSheet}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition"
                  style={{ background: addSheetColor }}
                >
                  Create sheet
                </button>
                <button
                  onClick={() => setShowAddSheet(false)}
                  className="px-3 py-1.5 text-xs rounded-lg transition"
                  style={{ border: '1px solid #e5e7eb', color: '#6b7280', background: 'white' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CANVAS ── */}
        <div
          ref={wrapperRef}
          className="relative flex flex-1"
          style={{
            overflow: 'hidden',
            cursor: dragging ? 'crosshair' : 'default',
            minHeight: 0,
          }}
        >
          {/* LEFT PANEL — Form Fields */}
          <div
            ref={leftPanelRef}
            className="flex flex-col gap-1 p-3 overflow-y-auto"
            style={{
              width: 280,
              minWidth: 280,
              flexShrink: 0,
              background: 'white',
              borderRight: '1px solid #f3f4f6',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-2 px-1"
              style={{ color: '#9ca3af' }}
            >
              Form Fields
            </div>

            {allFields.map(field => {
              const isMapped = activeRules.some(r => r.formFieldId === field.id)
              const otherCount = rules.filter(
                r => r.formFieldId === field.id && r.sheetId !== activeSheetId
              ).length
              const isNew = newNodeIds.has(field.id)
              return (
                <div
                  key={field.id}
                  className="group flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors"
                  style={{
                    background: isMapped ? themeColor + '12' : 'white',
                    border: `1px solid ${isMapped ? themeColor + '55' : '#e5e7eb'}`,
                    animation: isNew ? 'fme-slide-in 150ms ease-out forwards' : undefined,
                  }}
                  onMouseEnter={e => {
                    if (!isMapped) (e.currentTarget as HTMLElement).style.background = themeColor + '08'
                  }}
                  onMouseLeave={e => {
                    if (!isMapped) (e.currentTarget as HTMLElement).style.background = 'white'
                  }}
                >
                  <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    {field.isCustom && (
                      <button
                        onClick={() => handleDeleteField(field.id)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 text-[10px] font-bold rounded transition-opacity"
                        style={{ color: '#9ca3af', lineHeight: 1, padding: '1px 2px' }}
                        title="Remove field"
                      >
                        ×
                      </button>
                    )}
                    <span className="text-xs font-medium" style={{ color: '#111827' }}>
                      {field.label}
                    </span>
                    <span
                      className="text-[9px] px-1 py-0.5 rounded shrink-0"
                      style={{ background: '#f3f4f6', color: '#9ca3af' }}
                    >
                      {field.type}
                    </span>
                    {field.isCustom && (
                      <span
                        className="text-[9px] px-1 py-0.5 rounded shrink-0"
                        style={{ background: '#fef3c7', color: '#92400e' }}
                      >
                        custom
                      </span>
                    )}
                    {otherCount > 0 && (
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: '#dbeafe', color: '#1e40af' }}
                      >
                        +{otherCount}
                      </span>
                    )}
                  </div>
                  {/* Output handle */}
                  <div
                    ref={el => {
                      if (el) leftHandleRefs.current.set(field.id, el)
                      else leftHandleRefs.current.delete(field.id)
                    }}
                    onMouseDown={e => startDragFromLeft(e, field.id)}
                    onTouchStart={e => startDragFromLeft(e, field.id)}
                    className="w-3.5 h-3.5 rounded-full border-2 ml-2 transition-all shrink-0"
                    style={{
                      background: isMapped ? themeColor : 'white',
                      borderColor: isMapped ? themeColor : '#9ca3af',
                      cursor: 'crosshair',
                    }}
                    onMouseEnter={e => {
                      if (!isMapped) (e.currentTarget as HTMLElement).style.borderColor = themeColor
                    }}
                    onMouseLeave={e => {
                      if (!isMapped) (e.currentTarget as HTMLElement).style.borderColor = '#9ca3af'
                    }}
                  />
                </div>
              )
            })}

            {/* Add field row */}
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <input
                  value={addFieldLabel}
                  onChange={e => setAddFieldLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddField() }}
                  placeholder="Field name..."
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg outline-none"
                  style={{ border: '1px solid #e5e7eb', color: '#111827' }}
                />
                <select
                  value={addFieldType}
                  onChange={e => setAddFieldType(e.target.value)}
                  className="px-1.5 py-1.5 text-xs rounded-lg outline-none bg-white"
                  style={{ border: '1px solid #e5e7eb', color: '#374151' }}
                >
                  {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  onClick={handleAddField}
                  className="px-2 py-1.5 text-xs font-semibold rounded-lg text-white transition shrink-0"
                  style={{ background: '#3ECF8E' }}
                  title="Add field"
                >
                  + Add
                </button>
              </div>
              {addFieldError && (
                <span className="text-[10px] px-1" style={{ color: '#ef4444' }}>{addFieldError}</span>
              )}
            </div>
          </div>

          {/* MIDDLE */}
          <div
            className="flex-1"
            style={{ background: '#fafafa', borderLeft: '1px solid #f3f4f6', borderRight: '1px solid #f3f4f6' }}
          />

          {/* RIGHT PANEL — Sheet Columns */}
          <div
            ref={rightPanelRef}
            className="flex flex-col gap-1 p-3 overflow-y-auto"
            style={{
              width: 280,
              minWidth: 280,
              flexShrink: 0,
              background: 'white',
              borderLeft: '1px solid #f3f4f6',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-2 px-1"
              style={{ color: '#9ca3af' }}
            >
              {activeSheet?.label ?? 'Sheet'} Columns
            </div>

            {/* Empty state */}
            {(activeSheet?.columns ?? []).length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-8 text-center"
                style={{ color: '#9ca3af' }}
              >
                <div className="text-3xl mb-2">⬜</div>
                <div className="text-xs font-medium mb-1" style={{ color: '#6b7280' }}>No columns yet</div>
                <div className="text-[10px]">Add your first column below to start mapping</div>
              </div>
            )}

            {(activeSheet?.columns ?? []).map(col => {
              const rule = activeRules.find(r => r.columnId === col.id)
              const isMapped = !!rule
              const isNew = newNodeIds.has(col.id)
              const cond = conditions.find(
                c => c.sheetId === activeSheetId && c.targetColumnId === col.id
              )
              const hasCond = !!cond
              const fxOpen = fxColumnId === col.id
              const otherCols = (activeSheet?.columns ?? []).filter(c => c.id !== col.id)

              return (
                <div key={col.id} style={{ animation: isNew ? 'fme-slide-in 150ms ease-out forwards' : undefined }}>
                  <div
                    className="group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors"
                    style={{
                      background: isMapped ? themeColor + '12' : hasCond ? '#f0fdf4' : 'white',
                      border: `1px solid ${isMapped ? themeColor + '55' : hasCond ? '#86efac' : '#e5e7eb'}`,
                      borderBottomLeftRadius: fxOpen ? 0 : undefined,
                      borderBottomRightRadius: fxOpen ? 0 : undefined,
                    }}
                    onMouseEnter={e => {
                      if (!isMapped && !hasCond) (e.currentTarget as HTMLElement).style.background = themeColor + '08'
                    }}
                    onMouseLeave={e => {
                      if (!isMapped && !hasCond) (e.currentTarget as HTMLElement).style.background = 'white'
                    }}
                  >
                    {/* Input handle */}
                    <div
                      ref={el => {
                        if (el) rightHandleRefs.current.set(col.id, el)
                        else rightHandleRefs.current.delete(col.id)
                      }}
                      onMouseDown={isMapped ? e => startDragFromRight(e, col.id) : undefined}
                      onTouchStart={isMapped ? e => startDragFromRight(e, col.id) : undefined}
                      className="w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all"
                      style={{
                        background: isMapped ? themeColor : 'white',
                        borderColor: isMapped ? themeColor : '#9ca3af',
                        cursor: isMapped ? 'grab' : 'default',
                      }}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-medium" style={{ color: '#111827' }}>
                          {col.label}
                        </span>
                        {col.isCustom && (
                          <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ background: '#fef3c7', color: '#92400e' }}>
                            custom
                          </span>
                        )}
                      </div>
                      {isMapped && (
                        <span className="text-[9px] font-medium truncate mt-0.5" style={{ color: themeColor }}>
                          ← {rule.formFieldLabel}
                        </span>
                      )}
                      {hasCond && !isMapped && (
                        <span className="text-[9px] font-medium truncate mt-0.5" style={{ color: '#16a34a' }}>
                          = {cond.leftColumnLabel} {cond.operator} {cond.rightType === 'constant' ? cond.rightConstant : cond.rightColumnLabel}
                        </span>
                      )}
                    </div>

                    {/* fx condition button */}
                    <button
                      onClick={() => openConditionEditor(col.id)}
                      className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors"
                      style={{
                        background: hasCond || fxOpen ? '#dcfce7' : '#f3f4f6',
                        color: hasCond || fxOpen ? '#16a34a' : '#9ca3af',
                        border: `1px solid ${hasCond || fxOpen ? '#86efac' : '#e5e7eb'}`,
                      }}
                      title="Add formula condition"
                    >
                      fx
                    </button>

                    <button
                      onClick={() => handleDeleteColumn(col.id)}
                      className="opacity-0 group-hover:opacity-100 shrink-0 rounded transition-opacity flex items-center justify-center"
                      style={{ color: '#ef4444', lineHeight: 1, padding: '2px 4px', fontSize: 13, fontWeight: 'bold' }}
                      title="Delete column"
                    >
                      ×
                    </button>
                  </div>

                  {/* Inline condition editor */}
                  {fxOpen && (
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #86efac',
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#16a34a' }}>
                        Formula for "{col.label}"
                      </div>

                      {/* Row: left col = [left] [op] [right] */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] font-semibold" style={{ color: '#374151' }}>{col.label} =</span>

                        {/* Left operand */}
                        <select
                          className="text-[10px] rounded px-1.5 py-1 outline-none bg-white"
                          style={{ border: '1px solid #d1d5db', color: '#111827', maxWidth: 90 }}
                          value={fxDraft.leftColumnId ?? ''}
                          onChange={e => {
                            const c = otherCols.find(c => c.id === e.target.value)
                            setFxDraft(d => ({ ...d, leftColumnId: e.target.value, leftColumnLabel: c?.label ?? '' }))
                          }}
                        >
                          <option value="">col A…</option>
                          {otherCols.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>

                        {/* Operator */}
                        <select
                          className="text-[10px] rounded px-1.5 py-1 outline-none bg-white font-bold"
                          style={{ border: '1px solid #d1d5db', color: '#111827', width: 46 }}
                          value={fxDraft.operator ?? '+'}
                          onChange={e => setFxDraft(d => ({ ...d, operator: e.target.value as ConditionOperator }))}
                        >
                          {['+', '-', '*', '/', '='].map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>

                        {/* Right type toggle */}
                        <button
                          className="text-[10px] px-1.5 py-1 rounded"
                          style={{
                            background: fxDraft.rightType === 'column' ? '#dbeafe' : '#f3f4f6',
                            color: fxDraft.rightType === 'column' ? '#1d4ed8' : '#6b7280',
                            border: '1px solid #d1d5db',
                          }}
                          onClick={() => setFxDraft(d => ({ ...d, rightType: d.rightType === 'column' ? 'constant' : 'column' }))}
                        >
                          {fxDraft.rightType === 'column' ? 'col' : '123'}
                        </button>

                        {/* Right operand */}
                        {fxDraft.rightType === 'column' ? (
                          <select
                            className="text-[10px] rounded px-1.5 py-1 outline-none bg-white"
                            style={{ border: '1px solid #d1d5db', color: '#111827', maxWidth: 90 }}
                            value={fxDraft.rightColumnId ?? ''}
                            onChange={e => {
                              const c = otherCols.find(c => c.id === e.target.value)
                              setFxDraft(d => ({ ...d, rightColumnId: e.target.value, rightColumnLabel: c?.label ?? '' }))
                            }}
                          >
                            <option value="">col B…</option>
                            {otherCols.map(c => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            className="text-[10px] rounded px-1.5 py-1 outline-none"
                            style={{ border: '1px solid #d1d5db', color: '#111827', width: 60 }}
                            placeholder="value"
                            value={fxDraft.rightConstant ?? ''}
                            onChange={e => setFxDraft(d => ({ ...d, rightConstant: Number(e.target.value) }))}
                          />
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveCondition(col)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded text-white"
                          style={{ background: '#16a34a' }}
                        >
                          Save
                        </button>
                        {hasCond && (
                          <button
                            onClick={() => deleteCondition(col.id)}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded"
                            style={{ background: '#fee2e2', color: '#ef4444' }}
                          >
                            Remove
                          </button>
                        )}
                        <button
                          onClick={() => setFxColumnId(null)}
                          className="text-[10px] px-2.5 py-1 rounded"
                          style={{ background: '#f3f4f6', color: '#6b7280' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add column row */}
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <input
                  ref={addColInputRef}
                  value={addColLabel}
                  onChange={e => setAddColLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddColumn() }}
                  placeholder="Column name..."
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg outline-none"
                  style={{ border: '1px solid #e5e7eb', color: '#111827' }}
                />
                <button
                  onClick={handleAddColumn}
                  className="px-2 py-1.5 text-xs font-semibold rounded-lg text-white transition shrink-0"
                  style={{ background: themeColor }}
                  title="Add column"
                >
                  + Add
                </button>
              </div>
              {addColError && (
                <span className="text-[10px] px-1" style={{ color: '#ef4444' }}>{addColError}</span>
              )}
            </div>
          </div>

          {/* SVG OVERLAY */}
          <svg
            ref={svgRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 20,
              overflow: 'visible',
            }}
          />
        </div>

        {/* ── STATUS BAR ── */}
        <div
          className="flex items-center justify-between px-4 py-2 text-xs"
          style={{
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
            color: '#6b7280',
            flexShrink: 0,
          }}
        >
          <span>
            {mappedFieldCount} of {allFields.length} field
            {allFields.length !== 1 ? 's' : ''} mapped across {sheetsWithMappings} sheet
            {sheetsWithMappings !== 1 ? 's' : ''}
          </span>
          <span
            className="font-semibold transition-opacity duration-300"
            style={{ color: '#16a34a', opacity: savedFlash ? 1 : 0 }}
          >
            Saved ✓
          </span>
        </div>
      </div>
    </>
  )
}
