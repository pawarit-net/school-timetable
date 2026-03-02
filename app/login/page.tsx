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

    const cleanEmail = email.trim();
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

        // Step 2: ลอง Login ก่อน
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword,
        });

        if (!signInError) {
            router.push("/");
            return;
        }

        // Step 3: ถ้า Login ไม่ได้ → สมัครก่อน แล้ว Login ต่อทันที
        if (signInError.message.includes("Invalid login credentials") || signInError.message.includes("Email not confirmed")) {
            const { error: signUpError } = await supabase.auth.signUp({
                email: cleanEmail,
                password: cleanPassword,
                options: {
                    data: { 
                        full_name: teacher.full_name,
                        role: teacher.role 
                    }
                }
            });

            if (signUpError) throw signUpError;

            // ✅ Sign in ทันทีหลัง sign up สำเร็จ
            const { error: signInAfterSignUp } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password: cleanPassword,
            });

            if (signInAfterSignUp) throw signInAfterSignUp;

            router.push("/");
        } else {
            throw signInError;
        }

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
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
          >
            {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}