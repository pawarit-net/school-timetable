import { NextResponse, type NextRequest } from 'next/server'

// middleware นี้ทำแค่ pass-through ทุกหน้า
// การป้องกันสิทธิ์ทำใน client-side (page.tsx แต่ละหน้า) แทน
export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}