"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from "next/navigation";

export default function ManageSubjects() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchSubjects(); }, []);

  async function fetchSubjects() {
    const { data } = await supabase.from("subjects").select("*").order("code");
    if (data) setSubjects(data);
  }

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.from("subjects").insert([{ code: code.trim(), name: name.trim() }]);
    if (error) {
      setErrorMsg("เพิ่มไม่ได้ (รหัสวิชาอาจซ้ำ): " + error.message);
    } else {
      setCode(""); setName("");
      await fetchSubjects();
    }
    setLoading(false);
  }

  async function saveEdit() {
    if (!editCode.trim() || !editName.trim() || !editingId) return;
    setLoading(true);
    await supabase.from("subjects").update({ code: editCode.trim(), name: editName.trim() }).eq("id", editingId);
    setEditingId(null);
    await fetchSubjects();
    setLoading(false);
  }

  async function deleteSubject(id: number) {
    setLoading(true);
    await supabase.from("subjects").delete().eq("id", id);
    setDeleteConfirmId(null);
    await fetchSubjects();
    setLoading(false);
  }

  const filtered = useMemo(() => subjects.filter(s => {
    const matchSearch = search === "" ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase());
    const matchLevel = filterLevel === "all" || s.code.match(/(\d\d)/)?.[1] === filterLevel;
    return matchSearch && matchLevel;
  }), [subjects, search, filterLevel]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📚 จัดการรายวิชา
              <span className="ml-2 text-base font-normal text-slate-400">({subjects.length} วิชา)</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">เพิ่ม แก้ไข หรือลบรายวิชาในระบบ</p>
          </div>
          <button onClick={() => router.push('/')}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-medium text-sm hover:bg-slate-50 transition shadow-sm">
            ⬅️ กลับ
          </button>
        </div>

        {/* Add Form */}
        <form onSubmit={addSubject} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <input value={code} onChange={e => setCode(e.target.value)}
              placeholder="รหัสวิชา (เช่น ท101, ค201)"
              className="w-full md:w-40 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:ring-2 ring-pink-300" />
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="ชื่อวิชา (เช่น ภาษาไทย, คณิตศาสตร์)"
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:ring-2 ring-pink-300" />
            <button disabled={loading || !code.trim() || !name.trim()}
              className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50">
              + เพิ่มวิชา
            </button>
          </div>
          {errorMsg && <p className="text-red-500 text-xs px-1">{errorMsg}</p>}
        </form>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center gap-3">
          <span className="text-slate-400 text-sm pl-1">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหารหัสหรือชื่อวิชา..."
            className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400" />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-slate-400 hover:text-slate-600 px-2">✕</button>
          )}
          <span className="text-xs text-slate-400 font-medium pr-1">{filtered.length} / {subjects.length}</span>
        </div>

        {/* Level Filter */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 pl-1">🎓 ชั้น:</span>
          {[
            { value: "all", label: `ทั้งหมด (${subjects.length})` },
            { value: "31", label: `ม.4 (${subjects.filter(s => s.code.match(/(\d\d)/)?.[1] === "31").length})` },
            { value: "32", label: `ม.5 (${subjects.filter(s => s.code.match(/(\d\d)/)?.[1] === "32").length})` },
            { value: "33", label: `ม.6 (${subjects.filter(s => s.code.match(/(\d\d)/)?.[1] === "33").length})` },
          ].map(opt => (
            <button key={opt.value} onClick={() => setFilterLevel(opt.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${filterLevel === opt.value ? "bg-pink-600 text-white border-pink-600" : "bg-white text-slate-600 border-slate-200 hover:border-pink-300"}`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-slate-400">ไม่พบวิชาที่ค้นหา</p>
          ) : filtered.map(s => (
            <div key={s.id} className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-sm transition">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono bg-pink-50 border border-pink-100 text-pink-700 px-2.5 py-1 rounded-lg text-sm font-bold shrink-0">{s.code}</span>
                <span className="text-slate-800 font-medium truncate">{s.name}</span>
              </div>
              <div className="flex gap-1.5 shrink-0 ml-3">
                <button onClick={() => { setEditingId(s.id); setEditCode(s.code); setEditName(s.name); }}
                  className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 transition">
                  ✏️ แก้ไข
                </button>
                <button onClick={() => setDeleteConfirmId(s.id)}
                  className="text-xs font-bold text-red-500 hover:bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 transition">
                  🗑️ ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">✏️ แก้ไขรายวิชา</h3>
            <input autoFocus value={editCode} onChange={e => setEditCode(e.target.value)}
              placeholder="รหัสวิชา"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:ring-2 ring-indigo-300" />
            <input value={editName} onChange={e => setEditName(e.target.value)}
              placeholder="ชื่อวิชา"
              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:ring-2 ring-indigo-300" />
            <div className="flex gap-3">
              <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveEdit} disabled={loading || !editCode.trim() || !editName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border p-6 text-center space-y-4">
            <div className="text-4xl">🗑️</div>
            <div className="font-bold text-slate-800 text-lg">ยืนยันการลบ?</div>
            <p className="text-sm text-slate-500">
              วิชา <span className="font-bold text-slate-700">
                {subjects.find(s => s.id === deleteConfirmId)?.code} — {subjects.find(s => s.id === deleteConfirmId)?.name}
              </span> จะถูกลบออกจากระบบ
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => deleteSubject(deleteConfirmId)} disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50">ลบเลย</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}