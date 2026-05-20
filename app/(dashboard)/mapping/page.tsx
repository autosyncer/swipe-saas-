'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { MappingState, FieldMappingRule } from '@/components/FieldMappingEditor'
import { useSheets } from '@/hooks/useSheets'

const FieldMappingEditor = dynamic(
  () => import('@/components/FieldMappingEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center flex-1 text-sm" style={{ color: '#9ca3af' }}>
        Loading editor...
      </div>
    ),
  }
)
import { createClient } from '@/lib/supabase/client'
import { FORM_FIELDS } from '@/lib/sheet-definitions'

export default function MappingPage() {
  const { sheets, loading: sheetsLoading, addSheet, addColumn, deleteSheet, deleteColumn, renameSheet } = useSheets()
  const [initialMappings, setInitialMappings] = useState<MappingState | null>(null)

  // Load saved mappings from Supabase on mount
  useEffect(() => {
    async function loadMappings() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setInitialMappings({ rules: [], conditions: [], lastUpdated: new Date().toISOString(), version: 0 })
        return
      }
      const { data, error } = await supabase
        .from('field_mapping_rules')
        .select('*')
        .eq('user_id', user.id)
      if (error) {
        console.error('load mappings', error)
        setInitialMappings({ rules: [], conditions: [], lastUpdated: new Date().toISOString(), version: 0 })
        return
      }
      const rules: FieldMappingRule[] = (data ?? [])
        .filter((r: SupabaseRule) => r.form_field_id !== '__condition__')
        .map((r: SupabaseRule) => ({
          formFieldId: r.form_field_id,
          formFieldLabel: r.form_field_label,
          sheetId: r.sheet_id,
          sheetLabel: r.sheet_label,
          columnId: r.column_id,
          columnLabel: r.column_label,
        }))

      const conditions = (data ?? [])
        .filter((r: SupabaseRule) => r.form_field_id === '__condition__')
        .map((r: SupabaseRule) => {
          try { return JSON.parse(r.form_field_label) } catch { return null }
        })
        .filter(Boolean)

      setInitialMappings({ rules, conditions, lastUpdated: new Date().toISOString(), version: 0 })
    }
    loadMappings()
  }, [])

  const handleMappingsChange = useCallback(async (mappings: MappingState) => {
    // Mirror to localStorage for TransactionForm to read
    try { localStorage.setItem('field_mapping_rules', JSON.stringify(mappings)) } catch { /* quota */ }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Replace all rules for this user
    await supabase.from('field_mapping_rules').delete().eq('user_id', user.id)

    if (mappings.rules.length === 0) return

    const rows = [
      ...mappings.rules.map(r => ({
        user_id: user.id,
        form_field_id: r.formFieldId,
        form_field_label: r.formFieldLabel,
        sheet_id: r.sheetId,
        sheet_label: r.sheetLabel,
        column_id: r.columnId,
        column_label: r.columnLabel,
      })),
      // Store conditions as special rows: form_field_id = '__condition__', label = JSON
      ...(mappings.conditions ?? []).map(c => ({
        user_id: user.id,
        form_field_id: '__condition__',
        form_field_label: JSON.stringify(c),
        sheet_id: c.sheetId,
        sheet_label: '',
        column_id: c.targetColumnId,
        column_label: c.targetColumnLabel,
      })),
    ]

    const { error } = await supabase.from('field_mapping_rules').insert(rows)
    if (error) console.error('save mappings', error)
  }, [])

  // Convert useSheets Sheet[] to the shape FieldMappingEditor expects
  const editorSheets = sheets.map(s => ({
    id: s.sheet_key,
    label: s.label,
    themeColor: s.theme_color,
    isCustom: s.is_custom,
    columns: s.columns.map(c => ({
      id: c.column_key,
      label: c.label,
      isCustom: c.is_custom,
    })),
  }))

  const ready = !sheetsLoading && initialMappings !== null

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      <div className="mb-4">
        <h1 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>
          Field Mapping
        </h1>
        <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
          Drag from a form field handle (right side) to a sheet column handle (left side) to create
          a connection. Mappings are saved automatically.
        </p>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center flex-1 text-sm" style={{ color: '#9ca3af' }}>
          Loading...
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <FieldMappingEditor
            key="ready"
            formFields={FORM_FIELDS}
            sheets={editorSheets}
            initialMappings={initialMappings}
            onMappingsChange={handleMappingsChange}
            onAddSheet={addSheet}
            onAddColumn={(sheetId, label) => addColumn(sheetId, label)}
            onDeleteSheet={deleteSheet}
            onDeleteColumn={deleteColumn}
            onRenameSheet={renameSheet}
          />
        </div>
      )}
    </div>
  )
}

interface SupabaseRule {
  form_field_id: string
  form_field_label: string
  sheet_id: string
  sheet_label: string
  column_id: string
  column_label: string
  [key: string]: unknown
}
