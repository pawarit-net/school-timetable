"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabaseClient'

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ใช้ useCallback เพื่อให้ฟังก์ชันไม่เปลี่ยนบ่อย ป้องกัน useEffect รันซ้ำซ้อน
  const fetchUserProfile = useCallback(async (email: string) => {
    if (!email) return;
    try {
      const { data, error } = await supabase
        .from("teachers")
        .select("full_name, role")
        .eq("email", email)
        .single();
      
      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error("Navbar Error:", err);
    }
  }, []);

  useEffect(() => {
    // 1. ตรวจสอบ Session ทันทีที่ Component ถูกวาด (Mount)
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.email!);
      }
      setLoading(false);
    };

    getInitialSession();

    // 2. ฟังการเปลี่ยนแปลงสถานะ (สำคัญมากตรงการจัดการ Event)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth Event In Navbar:", event);
      
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.user) {
          setUser(session.user);
          await fetchUserProfile(session.user.email!);
        }
      } 
      
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        router.push("/login");
      }

      // ไม่ต้อง router.refresh() ในนี้ถ้าไม่จำเป็น เพราะอาจทำให้ Navbar กระตุก
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isActive = (path: string) => pathname === path;

  const menuItems = [
    { name: "🏠 หน้าหลัก", path: "/" },
    { name: "📅 จัดตาราง", path: "/manage-schedule" },
    { name: "👤 ตารางครู", path: "/teacher-schedule" },
    { name: "👨‍🏫 ครู", path: "/manage-teachers" },
    { name: "🏢 ห้อง", path: "/manage-classrooms" },
    { name: "📚 วิชา", path: "/manage-subjects" },
    { name: "⚙️ ตั้งค่า", path: "/settings" },
  ];

  return (
    <nav className="bg-white border-b sticky top-0 z-50 shadow-sm w-full font-sans">
      <div className="w-full max-w-[98%] mx-auto px-4 h-16 flex items-center justify-between gap-4">
        
        {/* ส่วนซ้าย: โลโก้ */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-1">
             <div className="text-2xl">🏫</div>
             <span className="text-xl md:text-2xl font-black text-blue-600 tracking-tight hidden sm:block">
              School<span className="text-blue-800">System</span>
            </span>
          </Link>
        </div>

        {/* ส่วนกลาง: เมนู (แสดงเมื่อ Login แล้ว) */}
        <div className="flex-1 flex justify-center">
            {!loading && user && (
                <div className="hidden lg:flex items-center space-x-1 overflow-x-auto p-1">
                    {menuItems.map((item) => (
                        <Link
                        key={item.path}
                        href={item.path}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                            isActive(item.path)
                            ? "bg-blue-50 text-blue-700 font-bold border border-blue-100"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium"
                        }`}
                        >
                        {item.name}
                        </Link>
                    ))}
                </div>
            )}
        </div>

        {/* ส่วนขวา: ข้อมูลผู้ใช้ */}
        <div className="flex-shrink-0 flex items-center gap-3">
          {loading ? (
             <div className="animate-pulse h-8 w-20 bg-gray-100 rounded"></div>
          ) : user ? (
            <>
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-bold text-gray-800 leading-tight max-w-[150px] truncate">
                  {profile?.full_name || user.email}
                </span>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                  {profile?.role || "USER"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-600 hover:text-white transition-colors"
              >
                ออก
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm"
            >
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </div>
      
      {/* Mobile Menu */}
      {!loading && user && (
        <div className="lg:hidden border-t bg-gray-50 overflow-x-auto">
            <div className="flex p-2 gap-2 min-w-max mx-auto px-4">
                 {menuItems.map((item) => (
                    <Link
                    key={item.path}
                    href={item.path}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                        isActive(item.path)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                    >
                    {item.name}
                    </Link>
                ))}
            </div>
        </div>
      )}
    </nav>
  );
}