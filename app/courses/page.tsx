"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: string;
  color_code: string;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    credits: 0.5,
    department: "ทั่วไป",
    color_code: "#4f46e5"
  });

  const departments = ["คณิตศาสตร์", "วิทยาศาสตร์", "ภาษาไทย", "ภาษาต่างประเทศ", "สังคมศึกษา", "ศิลปะ", "สุขศึกษา", "การงานอาชีพ", "ทั่วไป"];

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data } = await supabase.from("subjects").select("*").order("code");
    if (data) setSubjects(data);
    setLoading(false);
  };

  const handleEdit = (s: Subject) => {
    setEditingId(s.id);
    setFormData({
      code: s.code,
      name: s.name,
      credits: s.credits,
      department: s.department,
      color_code: s.color_code || "#4f46e5"
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const payload = { ...formData, code: formData.code.toUpperCase() };

    if (editingId) {
      await supabase.from("subjects").update(payload).eq("id", editingId);
    } else {
      await supabase.from("subjects").insert([payload]);
    }

    setEditingId(null);
    setFormData({ code: "", name: "", credits: 0.5, department: "ทั่วไป", color_code: "#4f46e5" });
    setShowModal(false);
    fetchSubjects();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">📚 รายวิชาทั้งหมด</h1>
            <p className="text-slate-500 text-sm">จัดการฐานข้อมูลวิชาเพื่อนำไปจัดโครงสร้างการสอน</p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="px-4 py-2 bg-white border rounded-xl font-medium hover:bg-slate-50 transition shadow-sm">🏠 หน้าหลัก</Link>
            <button 
              onClick={() => { setEditingId(null); setShowModal(true); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition"
            >
              + เพิ่มวิชาใหม่
            </button>
          </div>
        </div>

        {/* Subjects Grid/Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold border-b">
              <tr>
                <th className="p-4 w-16 text-center">สี</th>
                <th className="p-4">รหัสวิชา / ชื่อวิชา</th>
                <th className="p-4">หมวดสาระ</th>
                <th className="p-4 text-center">หน่วยกิต</th>
                <th className="p-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition group">
                  <td className="p-4">
                    <div className="w-8 h-8 rounded-xl border-2 border-white shadow-sm mx-auto" style={{ backgroundColor: s.color_code }} />
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{s.code}</div>
                    <div className="text-xs text-slate-500">{s.name}</div>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-600">{s.department}</td>
                  <td className="p-4 text-center font-mono font-bold text-indigo-600">{s.credits.toFixed(1)}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => handleEdit(s)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg">✏️</button>
                      <button 
                        onClick={async () => { if(confirm("ลบวิชานี้?")) { await supabase.from("subjects").delete().eq("id", s.id); fetchSubjects(); } }}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {subjects.length === 0 && !loading && (
            <div className="p-20 text-center text-slate-400">ไม่พบรายวิชาในระบบ</div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{editingId ? "✏️ แก้ไขข้อมูลวิชา" : "➕ เพิ่มรายวิชา"}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">รหัสวิชา</label>
                  <input className="w-full p-3 border rounded-2xl bg-slate-50 outline-none focus:ring-2 ring-indigo-500/20 uppercase font-bold" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})} required placeholder="ค21101" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">หน่วยกิต</label>
                  <input type="number" step="0.5" className="w-full p-3 border rounded-2xl bg-slate-50" value={formData.credits} onChange={e=>setFormData({...formData, credits: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">ชื่อวิชา</label>
                <input className="w-full p-3 border rounded-2xl bg-slate-50" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} required placeholder="คณิตศาสตร์พื้นฐาน" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">หมวดสาระ</label>
                  <select className="w-full p-3 border rounded-2xl bg-slate-50" value={formData.department} onChange={e=>setFormData({...formData, department: e.target.value})}>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">สีประจำวิชา</label>
                  <div className="flex gap-2 items-center h-[50px]">
                    <input type="color" className="w-full h-full border-none rounded-xl cursor-pointer bg-transparent" value={formData.color_code} onChange={e => setFormData({...formData, color_code: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-4 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 font-bold text-slate-400">ยกเลิก</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 disabled:opacity-50">
                  {loading ? "บันทึก..." : "บันทึกวิชา"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Processing Loader */}
      {loading && (
        <div className="fixed bottom-10 right-10 bg-white p-4 rounded-2xl shadow-2xl border border-indigo-50 flex items-center gap-3 z-[100]">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-600 uppercase">Updating...</span>
        </div>
      )}
    </div>
  );
}