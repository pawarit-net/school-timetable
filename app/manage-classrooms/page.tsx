"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from "next/navigation";

export default function ManageClassrooms() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [filterLevel, setFilterLevel] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const levels = useMemo(() => {
    const s = new Set<string>();
    classrooms.forEach(c => {
      const m = String(c.name).match(/^(\d+)\//);
      if (m) s.add(m[1]);
    });
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [classrooms]);

  const filtered = useMemo(() => classrooms.filter(c => {
    if (filterLevel === "all") return true;
    const m = String(c.name).match(/^(\d+)\//);
    return m?.[1] === filterLevel;
  }), [classrooms, filterLevel]);

  useEffect(() => { fetchClassrooms(); }, []);

  useEffect(() => {
    if (levels.length > 0 && filterLevel === "all") {
      setFilterLevel(levels[0]);
    }
  }, [levels]);

  async function fetchClassrooms() {
    const { data, error } = await supabase.from("classrooms").select("*");
    if (error) console.error("fetchClassrooms error:", error);
    const sorted = (data || []).sort((a, b) =>
      a.name.localeCompare(b.name, 'th', { numeric: true, sensitivity: 'base' })
    );
    setClassrooms(sorted);
  }

  async function addClassroom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("classrooms").insert([{ name: name.trim() }]);
    if (!error) { setName(""); await fetchClassrooms(); }
    setLoading(false);
  }

  async function saveEdit() {
    if (!editName.trim() || !editingId) return;
    setLoading(true);
    await supabase.from("classrooms").update({ name: editName.trim() }).eq("id", editingId);
    setEditingId(null);
    setEditName("");
    await fetchClassrooms();
    setLoading(false);
  }

  async function deleteClassroom(id: number) {
    setLoading(true);
    await supabase.from("classrooms").delete().eq("id", id);
    setDeleteConfirmId(null);
    await fetchClassrooms();
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🏢 จัดการห้องเรียน</h1>
            <p className="text-sm text-slate-500 mt-1">เพิ่ม แก้ไข หรือลบห้องเรียนในระบบ</p>
          </div>
          <button onClick={() => router.push('/')} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-medium text-sm hover:bg-slate-50 transition shadow-sm">
            ⬅️ กลับ
          </button>
        </div>

        <form onSubmit={addClassroom} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ชื่อห้อง เช่น 4/1, 5/2 วิทย์-คณิต ..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
          />
          <button disabled={loading || !name.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50">
            + เพิ่มห้อง
          </button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">🔍 กรองชั้น:</span>
          <button
            onClick={() => setFilterLevel("all")}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${filterLevel === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
            ทั้งหมด ({classrooms.length})
          </button>
          {levels.map(lv => (
            <button key={lv}
              onClick={() => setFilterLevel(lv)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${filterLevel === lv ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
              ม.{lv} ({classrooms.filter(c => { const m = String(c.name).match(/^(\d+)\//); return m?.[1] === lv; }).length})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5 text-center shadow-sm hover:shadow-md transition flex flex-col items-center gap-3">
              <div className="text-2xl font-black text-slate-800">{c.name}</div>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                  className="flex-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg py-1.5 transition">
                  ✏️ แก้ไข
                </button>
                <button
                  onClick={() => setDeleteConfirmId(c.id)}
                  className="flex-1 text-xs font-bold text-red-500 hover:bg-red-50 border border-red-200 rounded-lg py-1.5 transition">
                  🗑️ ลบ
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-4 py-16 text-center text-slate-400">ไม่พบห้องเรียนในชั้นนี้</div>
          )}
        </div>
      </div>

      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">✏️ แก้ไขชื่อห้อง</h3>
            <input
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
            />
            <div className="flex gap-3">
              <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveEdit} disabled={loading || !editName.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border p-6 text-center space-y-4">
            <div className="text-4xl">🗑️</div>
            <div className="font-bold text-slate-800 text-lg">ยืนยันการลบ?</div>
            <p className="text-sm text-slate-500">
              ห้อง <span className="font-bold text-slate-700">{classrooms.find(c => c.id === deleteConfirmId)?.name}</span> จะถูกลบออกจากระบบ
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => deleteClassroom(deleteConfirmId)} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50">ลบเลย</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}