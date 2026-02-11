import { createClient } from '@/lib/supabase' // ใช้ตัวนี้ตัวเดียวพอ
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    // ใช้ฟังก์ชันที่เราสร้างไว้ใน lib/supabase.ts
    // มันจัดการเรื่อง cookies() และ createServerClient ให้เรียบร้อยแล้ว
    const supabase = await createClient() 

    // แลกเปลี่ยนรหัส (Code) เป็น Session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // ตรวจสอบ origin และ redirect
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // ส่งผู้ใช้ไปยังหน้า Error หากเกิดความผิดพลาด
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}