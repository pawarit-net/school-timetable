"use client";
import { useState, useEffect } from "react";
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from "next/navigation";
import Link from "next/link";

// ✅ 1. Interface กำหนดโครงสร้างข้อมูล
interface Teacher {
  id: number;
  teacher_code: string;
  full_name: string;
  email: string;
  department: string;
  role: string;
}

export default function ManageTeachers() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State สำหรับฟอร์ม
  const [editingId, setEditingId] = useState<number | null>(null);
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

  // ✅ ฟังก์ชันจัดการ Submit (เพิ่ม/แก้ไข)
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
        // กรณีแก้ไข (Update)
        const { error: updateError } = await supabase
            .from("teachers")
            .update(payload)
            .eq("id", editingId);
        error = updateError;
    } else {
        // กรณีเพิ่มใหม่ (Insert)
        const { error: insertError } = await supabase
            .from("teachers")
            .insert([payload]);
        error = insertError;
    }

    if (error) {
      alert("Error: " + error.message);
    } else {
      resetForm();
      fetchTeachers();
    }
    setLoading(false);
  }

  function startEdit(teacher: Teacher) {
    setEditingId(teacher.id);
    setTeacherCode(teacher.teacher_code || "");
    setName(teacher.full_name);
    setEmail(teacher.email || "");
    setDepartment(teacher.department || "");
    setRole(teacher.role || "teacher");
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            👨‍🏫 จัดการบุคลากร (Teachers)
          </h1>
          <Link href="/" className="bg-white border border-slate-200 px-4 py-2 rounded-xl font-bold hover:bg-slate-50 transition shadow-sm text-sm text-slate-600 whitespace-nowrap">
            ⬅️ กลับหน้าหลัก
          </Link>
        </div>

        {/* ฟอร์มเพิ่ม/แก้ไขครู */}
        <form onSubmit={handleSubmit} className={`grid grid-cols-1 md:grid-cols-6 gap-4 mb-8 p-6 rounded-2xl shadow-sm border items-end transition-all ${editingId ? 'bg-amber-50 border-amber-200 ring-2 ring-amber-100' : 'bg-white border-slate-200'}`}>
          
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">รหัสประจำตัว</label>
            <input 
                type="text" 
                className="w-full border border-slate-200 p-3 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold text-indigo-700" 
                placeholder="T001"
                value={teacherCode} 
                onChange={(e) => setTeacherCode(e.target.value)} 
                required 
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 block mb-1">ชื่อ-นามสกุล</label>
            <input type="text" className="w-full border border-slate-200 p-3 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">อีเมล</label>
            <input type="email" className="w-full border border-slate-200 p-3 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">หมวด/แผนก</label>
            <input type="text" className="w-full border border-slate-200 p-3 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="เช่น ภาษาไทย" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">สิทธิ์การใช้งาน</label>
            <select 
                className="w-full border border-slate-200 p-3 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
            >
              <option value="teacher">👨‍🏫 Teacher</option>
              <option value="admin">👑 Admin</option>
            </select>
          </div>
          
          <div className="md:col-span-6 flex gap-2 pt-2">
            <button disabled={loading} className={`flex-1 py-3 rounded-xl font-bold shadow-sm transition active:scale-95 text-white ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {loading ? "..." : (editingId ? "💾 บันทึกการแก้ไข" : "+ เพิ่มรายชื่อใหม่")}
            </button>
            
            {editingId && (
                <button type="button" onClick={resetForm} className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-6 rounded-xl font-bold transition">
                    ยกเลิก
                </button>
            )}
          </div>
        </form>

        {/* ✅ ตารางแสดงผล (ปรับปรุงใหม่: Text Badge + Scrollable) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* div ตัวนี้ช่วยให้ตารางเลื่อนซ้ายขวาได้ ไม่ล้นจอ */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left">
                <thead className="bg-slate-50">
                <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">รหัส</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">ชื่อ-นามสกุล</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">อีเมล</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">หมวด</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase whitespace-nowrap">สิทธิ์</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase whitespace-nowrap">จัดการ</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                {teachers.map((t) => (
                    <tr key={t.id} className={`transition ${editingId === t.id ? 'bg-amber-50' : 'hover:bg-slate-50/80'}`}>
                        
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600 whitespace-nowrap">
                            {t.teacher_code || "-"}
                        </td>
                        
                        <td className="px-6 py-4 font-medium text-slate-800 whitespace-nowrap">
                            {t.full_name}
                        </td>
                        
                        <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                            {t.email}
                        </td>
                        
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                            <span className="bg-slate-100 px-2 py-1 rounded text-xs">{t.department || "ทั่วไป"}</span>
                        </td>
                        
                        {/* ✅ แสดงป้ายข้อความ Admin/Teacher ตรงกลาง */}
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                            {t.role === 'admin' ? (
                                <span className="inline-block min-w-[100px] bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold border border-purple-200 shadow-sm">
                                    👑 Admin
                                </span>
                            ) : (
                                <span className="inline-block min-w-[100px] bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200 shadow-sm">
                                    👨‍🏫 Teacher
                                </span>
                            )}
                        </td>

                        <td className="px-6 py-4 text-center whitespace-nowrap">
                            <div className="flex justify-center gap-2">
                                <button onClick={() => startEdit(t)} className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-2 rounded-lg font-bold transition text-xs flex items-center gap-1">
                                    ✏️ <span className="hidden lg:inline">แก้ไข</span>
                                </button>
                                <button onClick={() => deleteTeacher(t.id)} className="bg-red-50 hover:bg-red-100 text-red-500 p-2 rounded-lg font-bold transition text-xs flex items-center gap-1">
                                    🗑️ <span className="hidden lg:inline">ลบ</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>
          
          {teachers.length === 0 && (
             <div className="text-center py-12 text-slate-400">
                <p className="text-4xl mb-2">📭</p>
                <p>ยังไม่มีข้อมูลบุคลากร</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}