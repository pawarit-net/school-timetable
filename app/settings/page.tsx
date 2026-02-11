"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // State เก็บค่าจากฟอร์ม
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    // ดึงข้อมูลจากตาราง academic_settings ที่คุณมีอยู่แล้ว
    const { data, error } = await supabase
      .from("academic_settings")
      .select("*")
      .limit(1)
      .single();

    if (data) {
      // ถ้าเจอข้อมูล (เช่น 2569/3) ก็เอามาใส่ในช่อง
      setSettingsId(data.id);
      setYear(data.year?.toString() || "");
      setSemester(data.semester || "");
    } else {
      console.log("ยังไม่มีข้อมูลตั้งต้น");
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    // เตรียมข้อมูลที่จะบันทึก
    const payload = {
      year: parseInt(year), // แปลงเป็นตัวเลขให้ตรงกับ Type int4 ในรูป
      semester: semester,   // เป็น text ตามรูป
      // is_active: true    // (ถ้าต้องการบังคับเปิดใช้งานตลอด)
    };

    let error;

    if (settingsId) {
      // Update: ทับข้อมูลแถวเดิม (ID: 1)
      const res = await supabase
        .from("academic_settings")
        .update(payload)
        .eq("id", settingsId);
      error = res.error;
    } else {
      // Insert: สร้างใหม่ถ้ายังไม่มีเลย
      const res = await supabase
        .from("academic_settings")
        .insert([payload]);
      error = res.error;
    }

    if (error) {
      alert("❌ บันทึกไม่สำเร็จ: " + error.message);
    } else {
      alert("✅ บันทึกข้อมูลเรียบร้อย!");
      router.refresh(); // รีโหลดหน้าเว็บเพื่อให้ค่าใหม่ไปโชว์ที่เมนู
    }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg transition text-2xl">
          ⬅️ 
        </Link>
        <h1 className="text-xl font-bold text-slate-800">⚙️ ตั้งค่าระบบ (ปีการศึกษา)</h1>
      </header>

      <main className="max-w-xl mx-auto px-6 py-10">
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">
            📅 กำหนดปีการศึกษาปัจจุบัน
          </h2>

          {loading ? (
            <div className="text-center py-8 text-slate-400">⏳ กำลังเชื่อมต่อฐานข้อมูล...</div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              
              {/* ปีการศึกษา */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ปีการศึกษา (พ.ศ.)
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  placeholder="เช่น 2567"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">ตรงกับคอลัมน์ "year" (int4)</p>
              </div>

              {/* ภาคเรียน */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ภาคเรียนที่
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white"
                >
                  <option value="1">ภาคเรียนที่ 1</option>
                  <option value="2">ภาคเรียนที่ 2</option>
                  <option value="3">ภาคเรียนฤดูร้อน (Summer)</option>
                </select>
                 <p className="text-xs text-slate-400 mt-1">ตรงกับคอลัมน์ "semester" (text)</p>
              </div>

              {/* ปุ่มบันทึก */}
              <button
                type="submit"
                disabled={saving}
                className={`w-full py-3 rounded-xl font-bold text-white shadow-sm transition-all ${
                  saving 
                    ? "bg-slate-400 cursor-not-allowed" 
                    : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-md"
                }`}
              >
                {saving ? "⏳ กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
              </button>

            </form>
          )}
        </div>
      </main>
    </div>
  );
}