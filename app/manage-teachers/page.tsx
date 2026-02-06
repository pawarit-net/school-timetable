"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ManageTeachers() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State สำหรับฟอร์ม
  const [editingId, setEditingId] = useState<number | null>(null); // ✅ เก็บ ID ที่กำลังแก้ไข
  const [teacherCode, setTeacherCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("teacher");

  useEffect(() => {
    fetchTeachers();
  }, []);

  async function fetchTeachers() {
    const { data } = await supabase.from("teachers").select("*").order("teacher_code", { ascending: true });
    if (data) setTeachers(data);
  }

  // ✅ ฟังก์ชันจัดการ Submit (รวมทั้ง เพิ่มใหม่ และ บันทึกแก้ไข)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherCode || !name || !email) return alert("กรุณากรอกรหัสประจำตัว, ชื่อ และอีเมล");
    
    setLoading(true);

    const payload = { 
        teacher_code: teacherCode, 
        full_name: name, 
        email: email, 
        role: role, 
        department: department 
    };

    let error;

    if (editingId) {
        // 🟡 กรณีแก้ไข (Update)
        const { error: updateError } = await supabase
            .from("teachers")
            .update(payload)
            .eq("id", editingId);
        error = updateError;
    } else {
        // 🟢 กรณีเพิ่มใหม่ (Insert)
        const { error: insertError } = await supabase
            .from("teachers")
            .insert([payload]);
        error = insertError;
    }

    if (error) {
      alert("Error: " + error.message);
    } else {
      resetForm(); // ล้างฟอร์ม
      fetchTeachers(); // โหลดข้อมูลใหม่
    }
    setLoading(false);
  }

  // ✅ ฟังก์ชันเริ่มแก้ไข (ดึงข้อมูลมาใส่ฟอร์ม)
  function startEdit(teacher: any) {
    setEditingId(teacher.id);
    setTeacherCode(teacher.teacher_code || "");
    setName(teacher.full_name);
    setEmail(teacher.email);
    setDepartment(teacher.department || "");
    setRole(teacher.role);
    
    // เลื่อนหน้าจอขึ้นไปที่ฟอร์ม
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ✅ ฟังก์ชันล้างค่าในฟอร์ม
  function resetForm() {
    setEditingId(null);
    setTeacherCode(""); 
    setName(""); 
    setEmail(""); 
    setDepartment(""); 
    setRole("teacher");
  }

  async function deleteTeacher(id: number) {
    if (confirm("ต้องการลบรายชื่อนี้ใช่ไหม?")) {
      await supabase.from("teachers").delete().eq("id", id);
      fetchTeachers();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900">👨‍🏫 จัดการบุคลากร (Teachers & Staff)</h1>
          <Link href="/" className="bg-white border px-4 py-2 rounded-lg font-bold hover:bg-gray-100 transition">⬅️ กลับหน้าหลัก</Link>
        </div>

        {/* ฟอร์มเพิ่ม/แก้ไขครู */}
        {/* เปลี่ยนสีพื้นหลังถ้ากำลังแก้ไข */}
        <form onSubmit={handleSubmit} className={`grid grid-cols-1 md:grid-cols-6 gap-4 mb-8 p-6 rounded-2xl shadow-sm border items-end transition-colors ${editingId ? 'bg-yellow-50 border-yellow-200' : 'bg-white'}`}>
          
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">รหัสประจำตัว</label>
            <input 
                type="text" 
                className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white outline-none font-mono font-bold text-blue-800" 
                placeholder="เช่น T001"
                value={teacherCode} 
                onChange={(e) => setTeacherCode(e.target.value)} 
                required 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">ชื่อ-นามสกุล</label>
            <input type="text" className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white outline-none" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">อีเมล (Username)</label>
            <input type="email" className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white outline-none" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">หมวด/แผนก</label>
            <input type="text" className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white outline-none" placeholder="เช่น ภาษาไทย" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">สิทธิ์</label>
            <select className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white outline-none" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            {/* ปุ่ม Submit เปลี่ยนข้อความตามสถานะ */}
            <button disabled={loading} className={`w-full py-3 rounded-xl font-bold shadow-md transition active:scale-95 text-white ${editingId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {loading ? "..." : (editingId ? "💾 บันทึก" : "+ เพิ่ม")}
            </button>
            
            {/* ปุ่มยกเลิก แสดงเฉพาะตอนแก้ไข */}
            {editingId && (
                <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 text-gray-600 px-3 rounded-xl font-bold transition">
                    ❌
                </button>
            )}
          </div>
        </form>

        {/* ตารางแสดงผล */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">รหัส</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">ชื่อ-นามสกุล</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">อีเมล</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">หมวด</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">สิทธิ์</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {teachers.map((t) => (
                // ไฮไลท์แถวที่กำลังแก้ไข
                <tr key={t.id} className={`transition ${editingId === t.id ? 'bg-yellow-50' : 'hover:bg-blue-50/30'}`}>
                  <td className="px-6 py-4 font-mono font-bold text-blue-600">{t.teacher_code || "-"}</td>
                  <td className="px-6 py-4 font-bold text-gray-700">{t.full_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{t.email}</td>
                  <td className="px-6 py-4 text-sm text-blue-600 font-medium">{t.department || "-"}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${t.role === 'admin' ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-green-100 text-green-600 border-green-200'}`}>
                      {t.role === 'admin' ? 'Admin' : 'Teacher'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center flex justify-center gap-2">
                    {/* ปุ่มแก้ไข */}
                    <button onClick={() => startEdit(t)} className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 p-2 rounded-lg font-bold transition text-xs">
                        ✏️ แก้ไข
                    </button>
                    {/* ปุ่มลบ */}
                    <button onClick={() => deleteTeacher(t.id)} className="bg-red-50 hover:bg-red-100 text-red-500 p-2 rounded-lg font-bold transition text-xs">
                        🗑️ ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {teachers.length === 0 && (
             <div className="text-center py-10 text-gray-400">ยังไม่มีข้อมูลบุคลากร</div>
          )}
        </div>
      </div>
    </div>
  );
}