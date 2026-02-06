"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ManageClassrooms() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [name, setName] = useState("");

  useEffect(() => { fetchClassrooms() }, []);

  async function fetchClassrooms() {
    const { data } = await supabase.from("classrooms").select("*").order("name");
    if (data) setClassrooms(data);
  }

  async function addClassroom(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    const { error } = await supabase.from("classrooms").insert([{ name }]); // แก้ให้เหลือแค่ name ตาม DB
    if (!error) { setName(""); fetchClassrooms(); }
  }

  async function deleteClassroom(id: number) {
    if (confirm("ยืนยันการลบ?")) {
      await supabase.from("classrooms").delete().eq("id", id);
      fetchClassrooms();
    }
  }

  return (
    <div className="min-h-screen bg-white text-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between mb-8">
          <h1 className="text-3xl font-bold">🏢 จัดการห้องเรียน</h1>
          <button onClick={() => router.push('/')} className="bg-gray-200 px-4 py-2 rounded-lg font-bold">⬅️ กลับ</button>
        </div>
        
        <form onSubmit={addClassroom} className="flex gap-4 mb-8 bg-gray-50 p-6 rounded-xl border">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อห้อง (เช่น 4/1, 5/2)..." className="flex-1 border p-3 rounded-lg" />
          <button className="bg-green-600 text-white px-6 rounded-lg font-bold">+ เพิ่มห้อง</button>
        </form>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {classrooms.map((c) => (
            <div key={c.id} className="p-6 border rounded-xl text-center shadow-sm hover:shadow-md bg-white">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">{c.name}</h3>
              <button onClick={() => deleteClassroom(c.id)} className="text-red-500 text-sm font-bold">ลบห้องนี้</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}