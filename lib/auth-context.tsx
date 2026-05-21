'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface AuthUser {
  id: string
  email: string
  role: 'super_admin' | 'sub_admin'
  full_name: string
  assigned_accounts: string[]
  is_active: boolean
}

// undefined = not yet loaded, null = not logged in
const AuthContext = createContext<AuthUser | null | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    

    const fetchUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { setUser(null); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profile) {
        setUser({
          id: authUser.id,
          email: authUser.email ?? '',
          role: profile.role,
          full_name: profile.full_name,
          assigned_accounts: profile.assigned_accounts ?? [],
          is_active: profile.is_active,
        })
      } else {
        setUser(null)
      }
    }

    fetchUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser()
    })

    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
