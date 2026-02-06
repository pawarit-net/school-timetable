"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ManageSubjects() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => { fetchSubjects() }, []);

  async function fetchSubjects() {
    const { data } = await supabase.from("subjects").select("*").order("code");
    if (data) setSubjects(data);
  }

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !name) return;

    const { error } = await supabase.from("subjects").insert([{ code, name }]);
    if (error) {
      alert("เพิ่มไม่ได้ (รหัสวิชาอาจซ้ำ): " + error.message);
    } else {
      setCode("");
      setName("");
      fetchSubjects();
    }
  }

  async function deleteSubject(id: number) {
    if (confirm("ต้องการลบวิชานี้?")) {
      await supabase.from("subjects").delete().eq("id", id);
      fetchSubjects();
    }
  }

  return (
    <div className="min-h-screen bg-white text-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between mb-8">
          <h1 className="text-3xl font-bold">📚 จัดการรายวิชา ({subjects.length})</h1>
          <button onClick={() => router.push('/')} className="bg-gray-200 px-4 py-2 rounded-lg font-bold hover:bg-gray-300">
            ⬅️ กลับหน้าหลัก
          </button>
        </div>

        {/* ฟอร์มเพิ่มวิชา */}
        <form onSubmit={addSubject} className="flex flex-col md:flex-row gap-4 mb-8 bg-pink-50 p-6 rounded-xl border border-pink-100">
          <input 
            value={code} 
            onChange={(e) => setCode(e.target.value)} 
            placeholder="รหัสวิชา (เช่น ท101, ค201)" 
            className="w-full md:w-1/4 border p-3 rounded-lg" 
          />
          <input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="ชื่อวิชา (เช่น ภาษาไทย, คณิตศาสตร์)" 
            className="flex-1 border p-3 rounded-lg" 
          />
          <button className="bg-pink-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-pink-700">
            + เพิ่มวิชา
          </button>
        </form>

        {/* ตารางแสดงผล */}
        <div className="grid gap-3">
          {subjects.map((s) => (
            <div key={s.id} className="flex justify-between items-center p-4 border rounded-lg hover:shadow-md bg-white">
              <div>
                <span className="font-mono bg-gray-100 px-2 py-1 rounded mr-3 text-gray-600 font-bold">{s.code}</span>
                <span className="text-xl font-medium text-gray-800">{s.name}</span>
              </div>
              <button onClick={() => deleteSubject(s.id)} className="text-red-500 hover:text-red-700 font-bold px-3 py-1 bg-red-50 rounded">
                ลบ
              </button>
            </div>
          ))}
          {subjects.length === 0 && <p className="text-center text-gray-500">ยังไม่มีข้อมูลวิชา</p>}
        </div>
      </div>
    </div>
  );
}