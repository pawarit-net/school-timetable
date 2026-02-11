"use client";
import { useState } from "react";
import { supabase } from '@/lib/supabase-client'
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // รับค่า รหัสประจำตัว (Teacher Code)
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ฟังก์ชันล็อกอินด้วย Email + รหัสประจำตัว (ระบบใหม่)
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
        // Step 1: เช็คก่อนว่ามีชื่อและรหัสตรงกันในฐานข้อมูล teachers ไหม?
        const { data: teacher, error: dbError } = await supabase
            .from("teachers")
            .select("*")
            .eq("email", email)
            .eq("teacher_code", password) // เช็ครหัสประจำตัว
            .single();

        if (dbError || !teacher) {
            throw new Error("ไม่พบข้อมูล! กรุณาตรวจสอบอีเมล หรือรหัสประจำตัว");
        }

        // Step 2: ถ้ามีตัวตนจริง ให้ลอง Login เข้า Supabase Auth
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (!signInError) {
            // Login สำเร็จ
            router.push("/");
            return;
        }

        // Step 3: ถ้า Login ไม่ได้ (เช่น เข้าครั้งแรก) ให้ Auto Sign Up
        if (signInError.message.includes("Invalid login credentials")) {
            const { error: signUpError } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { 
                        full_name: teacher.full_name,
                        role: teacher.role 
                    }
                }
            });

            if (signUpError) throw signUpError;

            // Sign Up สำเร็จ -> ไปหน้าแรก
            router.push("/");
        } else {
            throw signInError; // Error อื่นๆ
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
        
        {/* แสดง Error Message ถ้ามี */}
        {errorMsg && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg text-center flex items-center justify-center gap-2">
                ⚠️ {errorMsg}
            </div>
        )}

        {/* Form Login */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">อีเมลโรงเรียน</label>
            <input 
              type="email" 
              className="w-full border-2 border-gray-200 p-3 rounded-xl bg-white text-black focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition font-medium"
              placeholder="teacher@school.ac.th"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
                รหัสประจำตัว (Password)
            </label>
            <input 
              type="password" 
              className="w-full border-2 border-gray-200 p-3 rounded-xl bg-white text-black focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition font-mono tracking-widest text-lg"
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
             <p className="text-xs text-gray-400 mt-2 text-right">ใช้รหัสประจำตัวครู (เช่น T001) ในการเข้าใช้งาน</p>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg shadow-blue-200"
          >
            {loading ? "กำลังตรวจสอบข้อมูล..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-gray-400 font-medium">
          * ระบบจะลงทะเบียนให้อัตโนมัติสำหรับการใช้งานครั้งแรก
        </p>
      </div>
    </div>
  );
}