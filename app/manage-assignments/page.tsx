"use client";
import { useState, useEffect } from "react";
import { supabase } from '@/lib/supabase-client'
import Link from "next/link";

// --- Interfaces ---
interface TimeSlot { id: number | string; label: string; time: string; isBreak?: boolean; }
interface Classroom { id: string; name: string; }
interface Subject { id: string; code: string; name: string; }
interface Teacher { id: string; full_name: string; department?: string; }
interface ScheduleItem {
  id?: number; 
  classroom_id?: string; 
  day_of_week: string; 
  slot_id: number; 
  subject_id: string; 
  teacher_id?: string; 
  is_locked?: boolean; 
  academic_year?: string; 
  semester?: string; 
  major_group?: string;
  subjects?: { code: string; name: string };
  teachers?: { full_name: string; department: string };
}

export default function ManageAssignments() {
  const [selectedRoom, setSelectedRoom] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ day: string, slotId: number } | null>(null);
  const [termInfo, setTermInfo] = useState({ year: "2567", semester: "1" });
  const [formData, setFormData] = useState({ subject_id: "", teacher_id: "", major_group: "ทั้งหมด", is_locked: true });

  const days = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
  const timeSlots: TimeSlot[] = [
    { id: 1, label: "คาบ 1", time: "08:30 - 09:20" },
    { id: 2, label: "คาบ 2", time: "09:20 - 10:10" },
    { id: "p1", label: "พัก", time: "10:10 - 10:25", isBreak: true },
    { id: 3, label: "คาบ 3", time: "10:25 - 11:15" },
    { id: 4, label: "คาบ 4", time: "11:15 - 12:05" },
    { id: "p2", label: "พักเที่ยง", time: "12:05 - 13:00", isBreak: true },
    { id: 5, label: "คาบ 5", time: "13:00 - 13:50" },
    { id: "p3", label: "พัก", time: "13:50 - 14:00", isBreak: true },
    { id: 6, label: "คาบ 6", time: "14:00 - 14:50" },
    { id: 7, label: "คาบ 7", time: "14:50 - 15:40" },
  ];

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { if (selectedRoom) fetchSchedule(); }, [selectedRoom, termInfo]);

  async function loadInitialData() {
    setIsLoading(true);
    try {
      const { data: settings } = await supabase.from("academic_settings").select("*").single();
      if (settings) setTermInfo({ year: settings.year?.toString() || "2567", semester: settings.semester || "1" });

      const [rooms, subs, tchs] = await Promise.all([
        supabase.from("classrooms").select("id, name").order('name'),
        supabase.from("subjects").select("id, code, name").order('code'),
        supabase.from("teachers").select("id, full_name, department").order('full_name')
      ]);
      if (rooms.data) setClassrooms(rooms.data);
      if (subs.data) setSubjects(subs.data);
      if (tchs.data) setTeachers(tchs.data);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchSchedule() {
    setIsLoading(true);
    try {
      const { data } = await supabase.from("teaching_assignments")
        .select(`*, subjects(code, name), teachers(full_name, department)`)
        .eq("classroom_id", selectedRoom)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);
      if (data) setScheduleData(data as ScheduleItem[]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.subject_id || !formData.teacher_id || !activeSlot) return alert("กรุณาเลือกวิชาและครู");
    setIsLoading(true);
    try {
      // 1. ตรวจสอบครูสอนซ้ำที่ห้องอื่น (Conflict Check)
      // ใช้ : { data: any } เพื่อให้ TS ยอมรับการเข้าถึง classrooms.name
      const { data: conflict }: { data: any } = await supabase.from("teaching_assignments")
        .select(`id, classrooms(name)`)
        .eq("teacher_id", formData.teacher_id)
        .eq("day_of_week", activeSlot.day)
        .eq("slot_id", activeSlot.slotId)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .maybeSingle();

      if (conflict) {
        const roomName = conflict.classrooms?.name || 'อื่น';
        alert(`❌ ครูท่านนี้มีสอนที่ "ห้อง ${roomName}" แล้วในคาบนี้`);
        setIsLoading(false);
        return;
      }

      // 2. ตรวจสอบว่าในคาบนี้มีวิชาอยู่แล้วหรือไม่
      const isAlreadyOccupied = scheduleData.some(item => 
        item.day_of_week === activeSlot.day && item.slot_id === activeSlot.slotId
      );
      if (isAlreadyOccupied && !confirm("คาบนี้มีวิชาลงไว้แล้ว ต้องการลงเพิ่มใช่หรือไม่?")) {
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.from("teaching_assignments").insert([{
        classroom_id: selectedRoom, 
        subject_id: formData.subject_id, 
        teacher_id: formData.teacher_id,
        day_of_week: activeSlot.day, 
        slot_id: activeSlot.slotId, 
        is_locked: formData.is_locked,
        major_group: formData.major_group, 
        academic_year: termInfo.year, 
        semester: termInfo.semester
      }]);

      if (!error) { 
        setIsModalOpen(false); 
        await fetchSchedule(); 
        setFormData(prev => ({ ...prev, subject_id: "", teacher_id: "" }));
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึก");
    } finally { 
      setIsLoading(false); 
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("ต้องการลบคาบเรียนนี้ใช่หรือไม่?")) return;
    setIsLoading(true);
    try {
      await supabase.from("teaching_assignments").delete().eq("id", id);
      await fetchSchedule();
    } finally {
      setIsLoading(false);
    }
  }

  async function clearSchedule() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน");
    const currentRoomName = classrooms.find(r => r.id === selectedRoom)?.name || "";
    if (!confirm(`⚠️ ยืนยันการล้างตารางทั้งหมดของ "ห้อง ${currentRoomName}"?`)) return;
    
    setIsLoading(true);
    try {
      await supabase.from("teaching_assignments")
        .delete()
        .eq("classroom_id", selectedRoom)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);
      setScheduleData([]); 
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">📅 จัดตารางสอนรายห้อง</h1>
            <p className="text-slate-500 text-sm">ปีการศึกษา {termInfo.year} เทอม {termInfo.semester}</p>
          </div>
          <Link href="/" className="px-5 py-2 bg-white border rounded-xl shadow-sm hover:bg-slate-50 transition font-medium">🏠 หน้าหลัก</Link>
        </div>

        {/* Toolbar */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-bold text-slate-600">ห้องเรียน</label>
            <select className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 ring-indigo-500/20" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
              <option value="">-- เลือกห้องเรียน --</option>
              {classrooms.map(r => <option key={r.id} value={r.id}>ห้อง {r.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => alert("ระบบ Auto-Assign กำลังพัฒนา...")} className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-sm">🤖 จัดอัตโนมัติ</button>
            <button onClick={clearSchedule} className="flex-1 md:flex-none px-6 py-3 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition">🗑️ ล้างตาราง</button>
          </div>
        </div>

        {/* Timetable Content */}
        {selectedRoom ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full border-collapse min-w-[1000px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-4 border-r font-bold w-24 sticky left-0 bg-slate-50 z-10 text-slate-400">วัน</th>
                  {timeSlots.map(s => (
                    <th key={s.id} className="p-3 border-r last:border-0 text-center">
                      <div className="text-xs font-bold text-indigo-900 uppercase">{s.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{s.time}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {days.map(day => (
                  <tr key={day} className="hover:bg-slate-50/50 transition">
                    <td className="p-4 border-r bg-slate-50 font-bold text-center text-slate-600 sticky left-0 z-10">{day}</td>
                    {timeSlots.map(slot => {
                      if (slot.isBreak) return <td key={slot.id} className="bg-slate-100/30 border-r text-[10px] text-slate-400 text-center italic">พัก</td>;
                      
                      const matches = scheduleData.filter(a => a.day_of_week === day && a.slot_id === Number(slot.id));
                      
                      return (
                        <td key={slot.id} className="border-r p-1 h-32 relative cursor-pointer group" onClick={() => { setActiveSlot({ day, slotId: Number(slot.id) }); setIsModalOpen(true); }}>
                          {matches.map((m, idx) => (
                            <div key={m.id || idx} className={`p-1.5 rounded-lg border shadow-sm mb-1 text-[10px] relative transition-all hover:scale-[1.02] ${m.is_locked ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); if(m.id) handleDelete(m.id); }} className="absolute -top-1 -right-1 bg-white border border-red-200 rounded-full w-5 h-5 flex items-center justify-center text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition z-20 hover:bg-red-50">×</button>
                              <div className="font-bold text-slate-900 truncate uppercase">{m.subjects?.code}</div>
                              <div className="text-slate-500 truncate">{m.teachers?.full_name}</div>
                              <div className="mt-1 flex justify-between items-center border-t border-black/5 pt-1">
                                <span className="bg-slate-200/50 px-1 rounded text-[8px] font-medium">{m.major_group}</span>
                                {m.is_locked && <span className="text-[10px]">🔒</span>}
                              </div>
                            </div>
                          ))}
                          <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-indigo-50/40 transition pointer-events-none">
                            <span className="text-indigo-600 font-bold text-[10px] bg-white px-3 py-1.5 rounded-full shadow-sm">+ เพิ่ม</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-32 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
              <div className="text-5xl mb-4">🏫</div>
              <div className="text-slate-400 font-medium">กรุณาเลือกห้องเรียนเพื่อเริ่มจัดการตาราง</div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">📌 วัน{activeSlot?.day} | คาบที่ {activeSlot?.slotId}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">วิชาเรียน</label>
                <select className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 ring-indigo-500/20" value={formData.subject_id} onChange={e => setFormData({ ...formData, subject_id: e.target.value })}>
                  <option value="">-- เลือกวิชา --</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">ครูผู้สอน</label>
                <select className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 ring-indigo-500/20" value={formData.teacher_id} onChange={e => setFormData({ ...formData, teacher_id: e.target.value })}>
                  <option value="">-- เลือกครู --</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} {t.department ? `(${t.department})` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">กลุ่มเรียน</label>
                <input className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 ring-indigo-500/20" value={formData.major_group} onChange={e => setFormData({ ...formData, major_group: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-amber-600" checked={formData.is_locked} onChange={e => setFormData({ ...formData, is_locked: e.target.checked })} />
                <span className="text-xs font-bold text-amber-800">🔒 ล็อกคาบเรียนนี้</span>
              </label>
              <div className="flex gap-2 pt-4 border-t">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 font-bold text-slate-400">ยกเลิก</button>
                <button onClick={handleSave} disabled={isLoading} className="flex-1 px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50">
                  {isLoading ? "บันทึก..." : "บันทึกข้อมูล"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Global Loader */}
      {isLoading && (
        <div className="fixed bottom-10 right-10 bg-white p-4 rounded-2xl shadow-2xl border flex items-center gap-3 z-[100]">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-600 uppercase">Processing...</span>
        </div>
      )}
    </div>
  );
}
