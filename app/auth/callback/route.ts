import { createClient } from '@/lib/supabaseServer' // ถูกต้องแล้ว เพราะเป็น server-side
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient() // ต้องมี await นะครับ
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/`)
    }
  }
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}