'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { BUILT_IN_SHEETS, type SheetDef } from '@/lib/sheet-definitions'

export interface SheetColumn {
  id: string
  column_key: string
  label: string
  is_custom: boolean
  column_order: number
}

export interface Sheet {
  id: string           // Supabase row UUID (use sheet_key for matching)
  sheet_key: string    // stable identifier like 'sheet_daily'
  label: string
  theme_color: string
  is_custom: boolean
  column_order: number
  columns: SheetColumn[]
}

export function useSheets() {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: sheetRows, error: sErr }, { data: colRows, error: cErr }] = await Promise.all([
      supabase.from('sheets').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('sheet_columns').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])

    if (sErr || cErr) {
      const err = sErr ?? cErr
      console.error('useSheets load error', err?.message, err?.details, err?.hint)
      setLoading(false)
      return
    }

    if (!sheetRows || sheetRows.length === 0) {
      await seedBuiltIn(user.id)
      // reload after seed
      const [{ data: seededSheets }, { data: seededCols }] = await Promise.all([
        supabase.from('sheets').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('sheet_columns').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      ])
      assemble(seededSheets ?? [], seededCols ?? [])
      return
    }

    assemble(sheetRows, colRows ?? [])

    function assemble(sRows: SheetRow[], cRows: ColRow[]) {
      const colsBySheet: Record<string, SheetColumn[]> = {}
      for (const c of cRows) {
        if (!colsBySheet[c.sheet_key]) colsBySheet[c.sheet_key] = []
        colsBySheet[c.sheet_key].push({
          id: c.id,
          column_key: c.column_key,
          label: c.label,
          is_custom: c.is_custom,
          column_order: c.column_order,
        })
      }
      const assembled: Sheet[] = sRows.map(s => ({
        id: s.id,
        sheet_key: s.sheet_key,
        label: s.label,
        theme_color: s.theme_color,
        is_custom: s.is_custom,
        column_order: s.column_order,
        columns: (colsBySheet[s.sheet_key] ?? []).sort((a, b) => a.column_order - b.column_order),
      }))
      setSheets(assembled)
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addSheet = useCallback(async (label: string, themeColor: string): Promise<string | undefined> => {
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return undefined
    const sheet_key = `custom_${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
    const { data, error } = await supabase.from('sheets').insert({
      user_id: user.id,
      sheet_key,
      label,
      theme_color: themeColor,
      is_custom: true,
      column_order: 9999,
    }).select('sheet_key').single()
    if (error) { console.error('addSheet', error); return undefined }
    await load()
    return data.sheet_key
  }, [load])

  const addColumn = useCallback(async (sheetKey: string, label: string): Promise<string | undefined> => {
    
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      console.error('addColumn: not authenticated', authErr)
      return undefined
    }
    if (!sheetKey) {
      console.error('addColumn: sheetKey is empty — no active sheet selected')
      return undefined
    }
    const column_key = `custom_${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
    const { data, error } = await supabase.from('sheet_columns').insert({
      user_id: user.id,
      sheet_key: sheetKey,
      column_key,
      label: label.trim(),
      is_custom: true,
      column_order: 9999,
    }).select('column_key').single()
    if (error) {
      console.error('addColumn: DB insert failed', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        sheetKey,
        label,
      })
      await load() // still reload to sync any partial state
      return undefined
    }
    await load()
    return data.column_key
  }, [load])

  const deleteSheet = useCallback(async (sheetKey: string): Promise<void> => {
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await Promise.all([
      supabase.from('sheets').delete().eq('user_id', user.id).eq('sheet_key', sheetKey),
      supabase.from('sheet_columns').delete().eq('user_id', user.id).eq('sheet_key', sheetKey),
    ])
    await load()
  }, [load])

  const deleteColumn = useCallback(async (sheetKey: string, columnKey: string): Promise<void> => {
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('sheet_columns').delete()
      .eq('user_id', user.id).eq('sheet_key', sheetKey).eq('column_key', columnKey)
    await load()
  }, [load])

  const renameSheet = useCallback(async (sheetKey: string, newLabel: string): Promise<void> => {
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('sheets').update({ label: newLabel })
      .eq('user_id', user.id).eq('sheet_key', sheetKey)
    await load()
  }, [load])

  return { sheets, loading, addSheet, addColumn, deleteSheet, deleteColumn, renameSheet, reload: load }
}

// ── Internal types ────────────────────────────────────────────────────────────

interface SheetRow {
  id: string
  sheet_key: string
  label: string
  theme_color: string
  is_custom: boolean
  column_order: number
}

interface ColRow {
  id: string
  sheet_key: string
  column_key: string
  label: string
  is_custom: boolean
  column_order: number
}

// ── Seed function ─────────────────────────────────────────────────────────────

async function seedBuiltIn(userId: string) {
  
  const sheetRows = BUILT_IN_SHEETS.map((s: SheetDef, i: number) => ({
    user_id: userId,
    sheet_key: s.id,
    label: s.label,
    theme_color: s.themeColor,
    is_custom: false,
    column_order: i,
  }))

  const { error: sErr } = await supabase.from('sheets').upsert(sheetRows, {
    onConflict: 'user_id,sheet_key',
  })
  if (sErr) { console.error('seedBuiltIn sheets', sErr); return }

  const colRows = BUILT_IN_SHEETS.flatMap((s: SheetDef) =>
    s.columns.map((c, j) => ({
      user_id: userId,
      sheet_key: s.id,
      column_key: c.id,
      label: c.label,
      is_custom: false,
      column_order: j,
    }))
  )

  const { error: cErr } = await supabase.from('sheet_columns').upsert(colRows, {
    onConflict: 'user_id,sheet_key,column_key',
  })
  if (cErr) console.error('seedBuiltIn columns', cErr)
}
