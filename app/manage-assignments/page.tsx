"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// --- Interfaces ---
interface TimeSlot {
  id: number | string;
  label: string;
  time: string;
  isBreak?: boolean;
}

interface Classroom {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  code: string;
  name: string;
}

interface Teacher {
  id: string;
  full_name: string;
  department?: string;
}

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
  // Relations
  subjects?: { code: string; name: string };
  teachers?: { full_name: string; department: string };
}

// Interface สำหรับข้อมูล Course Structure
interface CourseStructure {
  id: number;
  subject_id: string;
  teacher_id: string;
  periods_per_week: number;
  classroom_id: string;
  major_group?: string;
}

export default function ManageAssignments() {
  // --- State ---
  const [selectedRoom, setSelectedRoom] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ day: string, slotId: number } | null>(null);

  const [formData, setFormData] = useState({
    subject_id: "",
    teacher_id: "",
    major_group: "ทั้งหมด",
    is_locked: true
  });

  const [termInfo, setTermInfo] = useState({ year: "2567", semester: "1" });

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

  // --- Effects ---
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedRoom && termInfo.year) {
      fetchSchedule();
    } else {
      setScheduleData([]); // Clear data if room unselected
    }
  }, [selectedRoom, termInfo]);

  // --- Functions ---

  async function loadInitialData() {
    setIsLoading(true);
    try {
      // โหลดการตั้งค่าปีการศึกษา
      const { data: settings } = await supabase.from("academic_settings").select("*").single();
      if (settings) {
        setTermInfo({
          year: settings.year?.toString() || "2567",
          semester: settings.semester || "1"
        });
      }

      // โหลดข้อมูลหลักพร้อมกัน (Parallel Fetching) เพื่อความเร็ว
      const [roomsRes, subsRes, tchsRes] = await Promise.all([
        supabase.from("classrooms").select("id, name").order('name'),
        supabase.from("subjects").select("id, code, name").order('code'),
        supabase.from("teachers").select("id, full_name, department").order('full_name')
      ]);

      if (roomsRes.data) setClassrooms(roomsRes.data);
      if (subsRes.data) setSubjects(subsRes.data);
      if (tchsRes.data) setTeachers(tchsRes.data);

    } catch (error) {
      console.error("Error loading initial data:", error);
      alert("โหลดข้อมูลพื้นฐานล้มเหลว");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchSchedule() {
    if (!termInfo.year || !selectedRoom) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from("teaching_assignments")
      .select(`
        *, 
        subjects(code, name), 
        teachers(full_name, department)
      `)
      .eq("classroom_id", selectedRoom)
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester);

    setIsLoading(false);
    if (error) {
      console.error("Error fetching schedule:", error);
      alert("โหลดตารางเรียนไม่สำเร็จ: " + error.message);
    }
    if (data) setScheduleData(data);
  }

  async function handleClearSchedule() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน!");
    if (!confirm(`⚠️ คุณแน่ใจไหมที่จะลบคาบเรียนที่ไม่ได้ 'ล็อก' ทั้งหมดของห้องนี้?\n(ปี ${termInfo.year} เทอม ${termInfo.semester})`)) return;

    setIsLoading(true);
    const { error } = await supabase
      .from("teaching_assignments")
      .delete()
      .eq("classroom_id", selectedRoom)
      .eq("is_locked", false)
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester);

    if (error) {
      alert("ไม่สามารถล้างตารางได้: " + error.message);
    } else {
      await fetchSchedule();
    }
    setIsLoading(false);
  }

  // 🔥 Optimized Auto Schedule Function
  async function handleAutoSchedule() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน!");
    if (!confirm(`ระบบจะเติมวิชาตามแผนการเรียน ปี ${termInfo.year} เทอม ${termInfo.semester} ยืนยันหรือไม่?`)) return;

    setIsLoading(true);
    console.log("🔍 เริ่มต้นจัดตารางอัตโนมัติ...");

    try {
      // 1. ดึงแผนการเรียน (Course Structure)
      const { data: reqsData, error: reqError } = await supabase
        .from("course_structures")
        .select("*")
        .eq("classroom_id", selectedRoom)
        .eq("academic_year", termInfo.year)
        .eq("term", termInfo.semester);

      if (reqError) throw new Error(reqError.message);
      if (!reqsData || reqsData.length === 0) {
        throw new Error("ไม่พบแผนการเรียน (Course Structure) ของห้องนี้!");
      }

      const reqs = reqsData as CourseStructure[];

      // 2. 🚀 Optimization: ดึงตารางสอนของครูทุกคนที่เกี่ยวข้องมา "ครั้งเดียว"
      // เพื่อไม่ต้องยิง Database ใน Loop (แก้ปัญหา N+1)
      const teacherIds = [...new Set(reqs.map(r => r.teacher_id))]; // ดึง ID ครูที่ไม่ซ้ำกัน
      
      const { data: teacherConflicts, error: conflictError } = await supabase
        .from("teaching_assignments")
        .select("teacher_id, day_of_week, slot_id")
        .in("teacher_id", teacherIds) // เอาเฉพาะครูที่อยู่ในแผนการเรียนนี้
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);

      if (conflictError) throw new Error(conflictError.message);

      // สร้าง Set ของครูที่ไม่ว่าง เพื่อให้เช็คได้เร็วแบบ O(1)
      // Format Key: "teacherId-Day-Slot"
      const occupiedTeacherSlots = new Set<string>();
      teacherConflicts?.forEach(t => {
        occupiedTeacherSlots.add(`${t.teacher_id}-${t.day_of_week}-${t.slot_id}`);
      });

      // 3. เริ่มประมวลผลการจัดตาราง (In-Memory)
      let tempSchedule = [...scheduleData];
      let assignedCount = 0;
      const newAssignments: any[] = [];

      for (const req of reqs) {
        // นับจำนวนคาบที่จัดไปแล้ว (รวมที่อยู่ใน tempSchedule)
        const alreadyAssigned = tempSchedule.filter(s => s.subject_id === req.subject_id).length;
        let periodsToFill = req.periods_per_week - alreadyAssigned;

        if (periodsToFill <= 0) continue;

        // วนลูปวันและเวลาเพื่อหาช่องว่าง
        for (const day of days) {
          if (periodsToFill <= 0) break;

          for (const slot of timeSlots) {
            if (slot.isBreak || periodsToFill <= 0) continue;

            const slotIdNum = Number(slot.id);

            // 3.1 เช็คห้องเรียนว่างไหม (เช็คจาก tempSchedule ใน Memory)
            const isRoomOccupied = tempSchedule.some(s => s.day_of_week === day && s.slot_id === slotIdNum);
            if (isRoomOccupied) continue;

            // 3.2 เช็คครูว่างไหม (เช็คจาก Set ที่เตรียมไว้)
            const teacherKey = `${req.teacher_id}-${day}-${slotIdNum}`;
            if (occupiedTeacherSlots.has(teacherKey)) continue;

            // ✅ เจอช่องว่างที่ลงได้!
            const newAssignment = {
              classroom_id: selectedRoom,
              subject_id: req.subject_id,
              teacher_id: req.teacher_id,
              day_of_week: day,
              slot_id: slotIdNum,
              major_group: req.major_group || "ทั้งหมด",
              is_locked: false,
              academic_year: termInfo.year,
              semester: termInfo.semester
            };

            newAssignments.push(newAssignment); // เตรียมข้อมูลสำหรับ Bulk Insert
            
            // อัปเดต State ชั่วคราวเพื่อให้ Loop ถัดไปมองเห็นว่าตรงนี้ไม่ว่างแล้ว
            tempSchedule.push({ ...newAssignment, id: -1 } as ScheduleItem);
            
            // อัปเดตตารางครูชั่วคราวด้วย (กันครูสอน 2 วิชาในห้องเดียวกันเวลาเดียวกัน ซึ่งเป็นไปไม่ได้ แต่กันไว้ก่อน)
            occupiedTeacherSlots.add(teacherKey);

            assignedCount++;
            periodsToFill--;
          }
        }
      }

      // 4. บันทึกลง Database ทีเดียว (Bulk Insert)
      if (newAssignments.length > 0) {
        const { error: insertError } = await supabase
          .from("teaching_assignments")
          .insert(newAssignments);
        
        if (insertError) throw new Error(insertError.message);
      }

      alert(`✅ จัดตารางอัตโนมัติเสร็จสิ้น! (เพิ่ม ${assignedCount} คาบ)`);
      fetchSchedule(); // โหลดข้อมูลจริงใหม่

    } catch (err: any) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.subject_id || !formData.teacher_id) {
      alert("กรุณาเลือกวิชาและครูผู้สอน");
      return;
    }
    setIsLoading(true);

    try {
      // 1. เช็ค Conflict ครู (Check DB)
      // ดูว่าครูคนนี้ สอนห้องอื่น ในวัน/เวลานี้ หรือไม่
      const { data: conflict } = await supabase
        .from("teaching_assignments")
        .select(`id, classrooms(name)`)
        .eq("teacher_id", formData.teacher_id)
        .eq("day_of_week", activeSlot?.day)
        .eq("slot_id", activeSlot?.slotId)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .maybeSingle(); // ใช้ maybeSingle เพื่อไม่ให้ throw error ถ้าไม่เจอ

      if (conflict) {
        // Handle classrooms relation logic (Supabase sometimes returns array, sometimes object depending on config)
        const classroomName = Array.isArray(conflict.classrooms)
          ? conflict.classrooms[0]?.name
          : (conflict.classrooms as any)?.name;

        alert(`❌ ไม่สามารถจัดได้! ครูท่านนี้มีสอนที่ "ห้อง ${classroomName || 'อื่น'}" ในคาบนี้แล้ว`);
        return;
      }

      // 2. บันทึก
      const { error } = await supabase.from("teaching_assignments").insert([{
        classroom_id: selectedRoom,
        subject_id: formData.subject_id,
        teacher_id: formData.teacher_id,
        day_of_week: activeSlot?.day,
        slot_id: activeSlot?.slotId,
        is_locked: formData.is_locked,
        major_group: formData.major_group,
        academic_year: termInfo.year,
        semester: termInfo.semester
      }]);

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({ subject_id: "", teacher_id: "", major_group: "ทั้งหมด", is_locked: true });
      fetchSchedule();

    } catch (error: any) {
      alert("บันทึกไม่สำเร็จ: " + error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (confirm("ต้องการลบคาบเรียนนี้ใช่ไหม?")) {
      setIsLoading(true);
      await supabase.from("teaching_assignments").delete().eq("id", id);
      fetchSchedule();
      setIsLoading(false);
    }
  }

  // --- Render ---
  return (
    <div className="min-h-screen bg-white p-8 text-black pb-20">
      <div className="max-w-7xl mx-auto">

        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-white/50 z-[60] flex items-center justify-center backdrop-blur-[2px]">
            <div className="bg-white p-6 rounded-2xl shadow-xl border flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="font-bold text-blue-900">กำลังประมวลผล...</span>
            </div>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-800">
              📅 ระบบจัดตารางสอนรายห้อง
            </h1>
            <p className="text-gray-500 text-sm mt-1">จัดการตารางเรียน ตรวจสอบการชนกันของคาบเรียน</p>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-end md:items-center">
            <div className="bg-indigo-50 px-5 py-2 rounded-full border border-indigo-100 flex items-center gap-3 shadow-sm">
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[10px] uppercase text-indigo-400 font-bold tracking-wider">ปีการศึกษา</span>
                <span className="text-lg font-bold text-indigo-700">{termInfo.year}</span>
              </div>
              <div className="w-px h-8 bg-indigo-200"></div>
              <div className="flex flex-col items-start leading-tight">
                <span className="text-[10px] uppercase text-indigo-400 font-bold tracking-wider">ภาคเรียนที่</span>
                <span className="text-lg font-bold text-indigo-700">{termInfo.semester}</span>
              </div>
            </div>

            <Link href="/" className="bg-gray-100 px-4 py-2 rounded-lg border hover:bg-gray-200 h-12 flex items-center font-bold text-gray-600 transition">
              🏠 กลับหน้าหลัก
            </Link>
          </div>
        </div>

        {/* Toolbar Section */}
        <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col md:flex-row justify-between items-end gap-4 shadow-sm">
          <div className="w-full md:w-auto">
            <label className="block text-sm font-bold mb-2 text-blue-900">เลือกห้องเรียน:</label>
            <select
              className="w-full md:w-72 p-3 border-2 border-white rounded-xl shadow-sm outline-none focus:border-blue-500 text-black bg-white transition"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              <option value="">-- เลือกห้อง --</option>
              {classrooms.map(r => <option key={r.id} value={r.id}>ห้อง {r.name}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleClearSchedule}
              disabled={isLoading || !selectedRoom}
              className="bg-white text-red-600 px-4 py-2 rounded-lg font-bold border border-red-200 hover:bg-red-50 hover:border-red-300 transition shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🗑️ ล้างตาราง
            </button>
            <button
              onClick={handleAutoSchedule}
              disabled={isLoading || !selectedRoom}
              className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-green-700 hover:shadow-lg transition shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🤖 จัดอัตโนมัติ
            </button>
          </div>
        </div>

        {/* Table Section */}
        {selectedRoom ? (
          <div className="bg-white rounded-3xl border shadow-sm overflow-hidden overflow-x-auto ring-1 ring-gray-100">
            <div className="min-w-[1000px]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-4 border-r text-gray-500 font-medium w-24 sticky left-0 bg-gray-50 z-10">วัน / เวลา</th>
                    {timeSlots.map(s => (
                      <th key={s.id} className="p-2 text-xs border-r last:border-0 min-w-[100px]">
                        <div className="font-bold text-blue-900">{s.label}</div>
                        <div className="text-gray-400 font-normal text-[10px]">{s.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map(day => (
                    <tr key={day} className="border-b last:border-0 hover:bg-gray-50/30 transition-colors">
                      <td className="p-4 border-r bg-gray-50 font-bold text-center text-sm text-gray-700 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{day}</td>
                      {timeSlots.map(slot => {
                        if (slot.isBreak) return <td key={slot.id} className="bg-gray-100/50 border-r text-[10px] text-gray-400 text-center italic select-none">พัก</td>;

                        const slotIdNum = Number(slot.id);
                        const matches = scheduleData.filter(a => a.day_of_week === day && a.slot_id === slotIdNum);

                        return (
                          <td
                            key={slot.id}
                            className="border-r p-1 h-28 relative hover:bg-blue-50 transition cursor-pointer group align-top"
                            onClick={() => { setActiveSlot({ day, slotId: slotIdNum }); setIsModalOpen(true); }}
                          >
                            {matches.length > 0 ? (
                              <div className="space-y-1 h-full w-full">
                                {matches.map((m, idx) => (
                                  <div 
                                    key={m.id || idx} 
                                    className={`p-1.5 rounded-lg border shadow-sm relative group/item transition-transform hover:scale-[1.02] ${
                                      m.is_locked ? 'bg-orange-50 border-orange-200 shadow-orange-100' : 'bg-blue-50 border-blue-200 shadow-blue-100'
                                    }`}
                                  >
                                    <div className="flex justify-between items-start mb-1 gap-1">
                                      <span className="font-bold text-blue-900 text-[10px] leading-tight block truncate w-full" title={`${m.subjects?.code} ${m.subjects?.name}`}>
                                        {m.subjects?.code} {m.subjects?.name}
                                      </span>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); if (m.id) handleDelete(m.id); }} 
                                        className="opacity-0 group-hover/item:opacity-100 text-red-400 hover:text-red-600 transition absolute -top-1 -right-1 z-20 bg-white shadow-sm border rounded-full p-0.5"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                    <div className="text-[9px] text-gray-700 font-medium truncate" title={m.teachers?.full_name}>
                                      👤 {m.teachers?.full_name}
                                    </div>
                                    <div className="flex justify-between items-end mt-1">
                                      <div className="text-[8px] text-pink-500 font-bold uppercase tracking-tighter bg-pink-50 px-1 rounded border border-pink-100">
                                        {m.major_group}
                                      </div>
                                      {m.is_locked && <span className="text-[10px]" title="Locked">🔒</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-blue-400 bg-blue-100/50 p-1 rounded-md text-[10px] font-semibold">+ เพิ่ม</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-medium">👈 กรุณาเลือกห้องเรียนด้านบนเพื่อเริ่มจัดการตาราง</p>
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200 text-black" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-6 text-blue-900 border-b pb-4 flex justify-between items-center">
                <span>📝 จัดวิชาเรียน</span>
                <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                  {activeSlot?.day} (คาบ {activeSlot?.slotId})
                </span>
              </h2>
              
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">วิชาเรียน</label>
                  <select 
                    className="w-full border-2 p-3 rounded-xl outline-none focus:border-blue-500 text-black bg-white transition" 
                    value={formData.subject_id} 
                    onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                  >
                    <option value="">-- เลือกวิชา --</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">ครูผู้สอน</label>
                  <select 
                    className="w-full border-2 p-3 rounded-xl outline-none focus:border-blue-500 text-black bg-white transition" 
                    value={formData.teacher_id} 
                    onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                  >
                    <option value="">-- เลือกครู --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name} {t.department ? `(${t.department})` : ""}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">สายการเรียน / กลุ่มเรียน</label>
                  <input 
                    type="text" 
                    className="w-full border-2 p-3 rounded-xl outline-none focus:border-blue-500 text-black placeholder-gray-300 transition" 
                    value={formData.major_group} 
                    onChange={(e) => setFormData({ ...formData, major_group: e.target.value })} 
                    placeholder="เช่น ม.1/1, วิทย์-คณิต" 
                  />
                </div>

                <label className="flex items-center p-3 bg-orange-50 rounded-xl border border-orange-100 cursor-pointer hover:bg-orange-100 transition">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 accent-orange-500 mr-3" 
                    checked={formData.is_locked} 
                    onChange={(e) => setFormData({ ...formData, is_locked: e.target.checked })} 
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-orange-800">🔒 ล็อกคาบนี้</span>
                    <span className="text-[10px] text-orange-600">ห้ามระบบจัดอัตโนมัติย้ายหรือลบ</span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="py-3 font-bold text-gray-400 hover:text-gray-600 transition hover:bg-gray-50 rounded-xl"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleSave} 
                  disabled={isLoading} 
                  className="bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  บันทึกลงตาราง
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}