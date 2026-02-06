"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function DataSetup() {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    year: 2569,
    semester: "1"
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    // ดึงข้อมูลแถวที่ 1 มาแสดง
    const { data } = await supabase
      .from("academic_settings")
      .select("*")
      .eq('id', 1)
      .single();

    if (data) {
      setSettings({ year: data.year, semester: data.semester });
    }
  }

  async function handleSave() {
    setLoading(true);
    // อัปเดตข้อมูลทับลงไปที่แถวเดิม (id=1)
    const { error } = await supabase
        .from("academic_settings")
        .update({ 
            year: Number(settings.year), 
            semester: settings.semester 
        })
        .eq('id', 1);

    setLoading(false);
    if (error) {
        alert("เกิดข้อผิดพลาด: " + error.message);
    } else {
        alert("✅ บันทึกเรียบร้อย! ข้อมูลปีการศึกษาถูกเปลี่ยนแล้ว");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
      <div className="max-w-xl w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800">⚙️ ตั้งค่าระบบ (System Setup)</h1>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 underline">
                กลับหน้าหลัก
            </Link>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-600 p-6 text-white flex items-center gap-4">
                <span className="text-4xl">📅</span>
                <div>
                    <h2 className="text-xl font-bold">ปีการศึกษา & ภาคเรียน</h2>
                    <p className="text-green-100 text-sm opacity-90">กำหนดค่าปัจจุบันของระบบ</p>
                </div>
            </div>
            
            <div className="p-8 space-y-6">
                
                {/* Input ปี */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ปีการศึกษา (พ.ศ.)</label>
                    <input 
                        type="number" 
                        value={settings.year}
                        onChange={(e) => setSettings({...settings, year: Number(e.target.value)})}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl text-center text-xl font-bold focus:border-green-500 outline-none transition"
                    />
                </div>

                {/* Input เทอม */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ภาคเรียนที่</label>
                    <select 
                        value={settings.semester}
                        onChange={(e) => setSettings({...settings, semester: e.target.value})}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl text-center text-xl font-bold focus:border-green-500 outline-none bg-white transition"
                    >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">Summer</option>
                    </select>
                </div>

                <hr />

                <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 active:scale-95 transition shadow-lg disabled:opacity-50"
                >
                    {loading ? "กำลังบันทึก..." : "💾 บันทึกการเปลี่ยนแปลง"}
                </button>
            </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
            *เมื่อเปลี่ยนค่าที่นี่ หน้าจัดตารางสอนทั้งหมดจะเปลี่ยนไปแสดงข้อมูลของปี/เทอมใหม่ทันที
        </p>

      </div>
    </div>
  );
}