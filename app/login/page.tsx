"use client";
import { useState } from "react";
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      // Step 1: ตรวจสอบว่ามีครูในระบบ
      const { data: teacher, error: dbError } = await supabase
        .from("teachers")
        .select("*")
        .ilike("email", cleanEmail)
        .eq("teacher_code", cleanPassword)
        .maybeSingle();

      if (dbError) throw new Error("เกิดข้อผิดพลาดจากฐานข้อมูล: " + dbError.message);
      if (!teacher) throw new Error("อีเมลหรือรหัสประจำตัวไม่ถูกต้อง");

      // Step 2: พยายาม signUp ก่อนเสมอ (ถ้ามีอยู่แล้วจะ error ซึ่งไม่เป็นไร)
      await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            full_name: teacher.full_name,
            role: teacher.role
          }
        }
      });

      // Step 3: signIn เสมอ ไม่ว่า signUp จะสำเร็จหรือไม่
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (signInError) throw new Error("เข้าสู่ระบบไม่สำเร็จ: " + signInError.message);

      router.push("/");

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-black border border-gray-200">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-xl mx-auto flex items-center justify-center text-3xl mb-4">
            🏫
          </div>
          <h1 className="text-3xl font-bold text-blue-900">เข้าสู่ระบบ</h1>
          <p className="text-gray-500 text-sm mt-2">ระบบจัดตารางสอนออนไลน์</p>
        </div>
        
        {errorMsg && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg text-center">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">อีเมลโรงเรียน</label>
            <input 
              type="email" 
              className="w-full border-2 border-gray-200 p-3 rounded-xl bg-white text-black outline-none focus:border-blue-500"
              placeholder="teacher@school.ac.th"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">รหัสประจำตัว (Password)</label>
            <input 
              type="password" 
              className="w-full border-2 border-gray-200 p-3 rounded-xl bg-white text-black outline-none focus:border-blue-500 font-mono text-lg"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50"
          >
            {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}