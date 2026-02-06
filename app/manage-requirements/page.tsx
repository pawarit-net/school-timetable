"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function ManageRequirements() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    classroom_id: "",
    subject_id: "",
    teacher_id: "",
    periods_per_week: 1
  });

  useEffect(() => {
    fetchInitialData();
    fetchRequirements();
  }, []);

  async function fetchInitialData() {
    const { data: r } = await supabase.from("classrooms").select("*");
    const { data: s } = await supabase.from("subjects").select("*");
    const { data: t } = await supabase.from("teachers").select("*");
    setRooms(r || []);
    setSubjects(s || []);
    setTeachers(t || []);
  }

  async function fetchRequirements() {
    const { data } = await supabase
      .from("subject_requirements")
      .select(`*, classrooms(name), subjects(name), teachers(full_name)`);
    setRequirements(data || []);
  }

  async function handleAdd() {
    if (!formData.classroom_id || !formData.subject_id || !formData.teacher_id) {
      alert("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    const { error } = await supabase.from("subject_requirements").insert([formData]);
    if (!error) {
      fetchRequirements();
      setFormData({ ...formData, periods_per_week: 1 });
    }
  }

  async function handleDelete(id: number) {
    await supabase.from("subject_requirements").delete().eq("id", id);
    fetchRequirements();
  }

  return (
    <div className="min-h-screen bg-white p-8 text-black">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">📋 กำหนดแผนการเรียน (จำนวนคาบ/สัปดาห์)</h1>
          <Link href="/" className="text-gray-500 underline">กลับหน้าหลัก</Link>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-6 rounded-2xl mb-8 border border-dashed">
          <select className="p-3 border rounded-xl" value={formData.classroom_id} onChange={e => setFormData({...formData, classroom_id: e.target.value})}>
            <option value="">-- เลือกห้อง --</option>
            {rooms.map(r => <option key={r.id} value={r.id}>ห้อง {r.name}</option>)}
          </select>
          <select className="p-3 border rounded-xl" value={formData.subject_id} onChange={e => setFormData({...formData, subject_id: e.target.value})}>
            <option value="">-- เลือกวิชา --</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="p-3 border rounded-xl" value={formData.teacher_id} onChange={e => setFormData({...formData, teacher_id: e.target.value})}>
            <option value="">-- เลือกครู --</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="number" min="1" className="p-3 border rounded-xl w-20" value={formData.periods_per_week} onChange={e => setFormData({...formData, periods_per_week: parseInt(e.target.value)})} />
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1 font-bold">เพิ่มแผน</button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border rounded-3xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4">ห้อง</th>
                <th className="p-4">วิชา</th>
                <th className="p-4">ครูผู้สอน</th>
                <th className="p-4 text-center">จำนวนคาบ/สัปดาห์</th>
                <th className="p-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map(req => (
                <tr key={req.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 font-bold">ห้อง {req.classrooms?.name}</td>
                  <td className="p-4">{req.subjects?.name}</td>
                  <td className="p-4 text-gray-600">{req.teachers?.full_name}</td>
                  <td className="p-4 text-center font-bold text-blue-600">{req.periods_per_week} คาบ</td>
                  <td className="p-4 text-center">
                    <button onClick={() => handleDelete(req.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}