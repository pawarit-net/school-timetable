"use client";
import { useState, useEffect } from "react";
import { supabase } from '@/lib/supabaseClient'
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
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [activeSlot, setActiveSlot] = useState<{ day: string, slotId: number } | null>(null);
  const [termInfo, setTermInfo] = useState({ year: "2569", semester: "3" });
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState(false);

  // State โครงสร้างรายวิชา (สำหรับแสดงสรุปแบบ persistent)
  const [courseStructures, setCourseStructures] = useState<any[]>([]);

  // Form Data
  const [formData, setFormData] = useState({ 
    subject_id: "", 
    teacher_id: "", 
    major_group: "ทั้งหมด", 
    is_locked: true 
  });

  // Form Data สำหรับวิชาส่วนกลาง
  const [fixedFormData, setFixedFormData] = useState({
    subject_id: "",
    day_of_week: "จันทร์",
    slot_id: 1,
    teacher_id: "", 
    major_group: "กิจกรรม",
    target_level: "all",
    delete_old: true
  });

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

  // Slot IDs ที่ใช้ได้จริง (ไม่รวมพัก)
  const realSlotIds = timeSlots.filter(s => !s.isBreak).map(s => Number(s.id));

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { if (selectedRoom) fetchSchedule(); }, [selectedRoom, termInfo]);

  async function loadInitialData() {
    setIsLoading(true);
    try {
      const { data: settings } = await supabase.from("academic_settings").select("*").single();
      if (settings) setTermInfo({ year: settings.year?.toString() || "2569", semester: settings.semester || "3" });

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
      const [assignRes, structRes] = await Promise.all([
        supabase.from("teaching_assignments")
          .select(`*, subjects(code, name), teachers(full_name, department)`)
          .eq("classroom_id", selectedRoom)
          .eq("academic_year", termInfo.year)
          .eq("semester", termInfo.semester),
        supabase.from("course_structures")
          .select(`*, course_teachers(teacher_id)`)
          .eq("classroom_id", selectedRoom)
          .eq("academic_year", termInfo.year)
          .eq("term", termInfo.semester)
      ]);
      if (assignRes.data) setScheduleData(assignRes.data as ScheduleItem[]);
      if (structRes.data) setCourseStructures(structRes.data);
    } finally {
      setIsLoading(false);
    }
  }

  const handleEditClick = (item: ScheduleItem) => {
    setEditingId(item.id || null);
    setActiveSlot({ day: item.day_of_week, slotId: item.slot_id });
    setFormData({
        subject_id: item.subject_id,
        teacher_id: item.teacher_id || "",
        major_group: item.major_group || "ทั้งหมด",
        is_locked: item.is_locked || false
    });
    setSubjectSearch("");
    setSubjectDropdownOpen(false);
    setTeacherSearch("");
    setTeacherDropdownOpen(false);
    setIsModalOpen(true);
  };

  async function handleSave() {
    if (!formData.subject_id || !activeSlot) return;
    setIsLoading(true);

    const payload = {
      classroom_id: selectedRoom,
      subject_id: formData.subject_id,
      teacher_id: formData.teacher_id || null,
      day_of_week: activeSlot.day,
      slot_id: activeSlot.slotId,
      is_locked: formData.is_locked,
      major_group: formData.major_group,
      academic_year: termInfo.year,
      semester: termInfo.semester
    };

    let error;
    if (editingId) {
      const { error: updateError } = await supabase
        .from("teaching_assignments")
        .update(payload)
        .eq("id", editingId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("teaching_assignments")
        .insert([payload]);
      error = insertError;
    }

    if(!error) { 
        setIsModalOpen(false); 
        setEditingId(null);
        await fetchSchedule(); 
    } else {
        alert("เกิดข้อผิดพลาด: " + error.message);
    }
    setIsLoading(false);
  }

  // --- Logic สรุปข้อมูล (Summary) ---
  const summaryList = Object.values(scheduleData.reduce((acc: any, item) => {
    const key = `${item.subject_id}-${item.teacher_id || 'null'}`;
    if (!acc[key]) {
        acc[key] = {
            id: key,
            code: item.subjects?.code || "-",
            name: item.subjects?.name || "ไม่ระบุ",
            teacher: item.teachers?.full_name || "-",
            count: 0
        };
    }
    acc[key].count++;
    return acc;
  }, {})).sort((a: any, b: any) => a.code.localeCompare(b.code));

  const totalPeriods = (summaryList as any[]).reduce((sum, item) => sum + item.count, 0);

  // --- คำนวณสรุปผลเทียบกับโครงสร้าง (persistent, ไม่ต้องกดปุ่ม) ---
  const structureSummary = courseStructures.length > 0
    ? courseStructures.map((s: any) => {
        const subjectInfo = subjects.find(sub => sub.id === s.subject_id);
        const teacherId = s.course_teachers?.[0]?.teacher_id || null;
        const teacherInfo = teachers.find(t => t.id === teacherId);
        const needed = s.periods_per_week || 1;
        const placed = scheduleData.filter(a => a.subject_id === s.subject_id).length;
        return {
          subject_id: s.subject_id,
          subject_code: subjectInfo?.code || "-",
          subject_name: subjectInfo?.name || s.subject_id,
          teacher_name: teacherInfo?.full_name || "-",
          needed,
          placed,
        };
      }).sort((a: any, b: any) => a.subject_code.localeCompare(b.subject_code))
    : null;

  // --- 🤖 ฟังก์ชันจัดตารางอัตโนมัติ ---
  async function handleAutoAssign() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน");

    const mode = confirm(
      `ต้องการ "ล้างตารางเดิมทั้งหมด" ก่อนจัดใหม่หรือไม่?\n\n[OK] = ล้างแล้วจัดใหม่\n[Cancel] = เติมเฉพาะช่องว่าง (เก็บวิชาล็อกไว้)`
    ) ? 'reset' : 'fill';

    setIsLoading(true);

    try {
      // 1. โหลดโครงสร้างรายวิชา (course_structures) ของห้องนี้
      const { data: structures, error: structError } = await supabase
        .from("course_structures")
        .select(`*, course_teachers(teacher_id)`)
        .eq("classroom_id", selectedRoom)
        .eq("academic_year", termInfo.year)
        .eq("term", termInfo.semester);

      if (structError || !structures || structures.length === 0) {
        alert("⚠️ ไม่พบข้อมูลโครงสร้างรายวิชาของห้องนี้\nกรุณาตั้งค่าโครงสร้างรายวิชาก่อนใช้งานฟีเจอร์นี้");
        return;
      }

      // 2. ถ้า reset → ลบเฉพาะคาบที่ไม่ได้ล็อก
      if (mode === 'reset') {
        await supabase.from("teaching_assignments")
          .delete()
          .eq("classroom_id", selectedRoom)
          .eq("academic_year", termInfo.year)
          .eq("semester", termInfo.semester)
          .eq("is_locked", false);
      }

      // 3. โหลดตารางปัจจุบัน (หลังจากลบแล้ว) เพื่อรู้ว่าช่องไหนถูกใช้แล้ว
      const { data: existing } = await supabase
        .from("teaching_assignments")
        .select("day_of_week, slot_id, teacher_id")
        .eq("classroom_id", selectedRoom)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);

      // ชุด key ที่ถูกใช้แล้วในห้องนี้: "day-slotId"
      const usedRoomSlots = new Set<string>(
        (existing || []).map((r: any) => `${r.day_of_week}-${r.slot_id}`)
      );

      // ชุด key ที่ครูถูกใช้อยู่แล้ว: "teacherId-day-slotId"
      const usedTeacherSlots = new Set<string>(
        (existing || [])
          .filter((r: any) => r.teacher_id)
          .map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`)
      );

      // ชุด key วิชาที่ลงในวันนั้นแล้ว: "subjectId-day"
      // — ป้องกันวิชาเดียวกันลงวันซ้ำ และนับจากที่ลงมือเองไว้แล้วด้วย
      const usedSubjectDays = new Set<string>(
        (existing || []).map((r: any) => `${r.subject_id}-${r.day_of_week}`)
      );

      // ชุด subjectId ที่มีอยู่แล้วในตาราง (ลงมือเอง) → หักออกจาก periods_needed
      const existingSubjectCount: Record<string, number> = {};
      for (const r of (existing || [])) {
        existingSubjectCount[r.subject_id] = (existingSubjectCount[r.subject_id] || 0) + 1;
      }

      // 4. เตรียม "งาน" ที่ต้องจัดใส่ตาราง
      type Job = {
        subject_id: string;
        teacher_id: string | null;
        periods_needed: number;
        major_group: string;
      };

      const jobs: Job[] = structures
        .map((s: any) => {
          const alreadyPlaced = existingSubjectCount[s.subject_id] || 0;
          const needed = Math.max(0, (s.periods_per_week || 1) - alreadyPlaced);
          return {
            subject_id: s.subject_id,
            teacher_id: s.course_teachers?.[0]?.teacher_id || null,
            periods_needed: needed,
            major_group: s.major_group || "ทั้งหมด",
          };
        })
        .filter((j: Job) => j.periods_needed > 0); // ข้ามวิชาที่ลงครบแล้ว

      // สร้างลิสต์ของ slot ว่างทั้งหมด (วน days × realSlotIds)
      const allSlots: { day: string; slotId: number }[] = [];
      for (const day of days) {
        for (const slotId of realSlotIds) {
          allSlots.push({ day, slotId });
        }
      }

      // กรองเอาเฉพาะ slot ที่ยังว่างอยู่ในห้องนี้
      let availableSlots = allSlots.filter(
        s => !usedRoomSlots.has(`${s.day}-${s.slotId}`)
      );

      // shuffle เพื่อกระจาย (Fisher-Yates)
      for (let i = availableSlots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
      }

      // 5. จัดวาง: วนทีละ job, หาคาบว่างที่ครูไม่ชนและวิชาไม่ซ้ำวัน
      const toInsert: any[] = [];

      for (const job of jobs) {
        let placed = 0;
        const newAvailable: typeof availableSlots = [];

        for (const slot of availableSlots) {
          if (placed >= job.periods_needed) {
            newAvailable.push(slot);
            continue;
          }

          const teacherBusy = job.teacher_id
            ? usedTeacherSlots.has(`${job.teacher_id}-${slot.day}-${slot.slotId}`)
            : false;

          // วิชาเดียวกันห้ามลงวันเดียวกัน
          const subjectSameDay = usedSubjectDays.has(`${job.subject_id}-${slot.day}`);

          if (!teacherBusy && !subjectSameDay) {
            toInsert.push({
              classroom_id: selectedRoom,
              subject_id: job.subject_id,
              teacher_id: job.teacher_id,
              day_of_week: slot.day,
              slot_id: slot.slotId,
              is_locked: false,
              major_group: job.major_group,
              academic_year: termInfo.year,
              semester: termInfo.semester,
            });

            usedRoomSlots.add(`${slot.day}-${slot.slotId}`);
            usedSubjectDays.add(`${job.subject_id}-${slot.day}`);
            if (job.teacher_id) {
              usedTeacherSlots.add(`${job.teacher_id}-${slot.day}-${slot.slotId}`);
            }
            placed++;
          } else {
            newAvailable.push(slot);
          }
        }

        availableSlots = newAvailable;
      }

      // 6. Insert ทั้งหมดในครั้งเดียว
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from("teaching_assignments")
          .insert(toInsert);
        if (insertErr) throw insertErr;
      }
      // สรุปผลจะแสดงอัตโนมัติจาก structureSummary หลัง fetchSchedule

    } catch (err: any) {
      console.error(err);
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setIsLoading(false);
      await fetchSchedule();
    }
  }

  // --- 🚀 ฟังก์ชันลงวิชาส่วนกลาง (คงเดิม) ---
  async function handleSaveGlobalSubject() {
    if (!fixedFormData.subject_id) return alert("กรุณาเลือกวิชา");
    let targetRooms = classrooms;
    const levelLabel = fixedFormData.target_level === 'all' ? "ทุกระดับชั้น" : `ม.${fixedFormData.target_level}`;
    if (fixedFormData.target_level !== 'all') {
        targetRooms = classrooms.filter(r => 
            r.name.trim().startsWith(fixedFormData.target_level) || 
            r.name.trim().startsWith("ม." + fixedFormData.target_level)
        );
    }
    if (targetRooms.length === 0) return alert(`ไม่พบห้องเรียนในระดับชั้น ${levelLabel}`);
    const subjectName = subjects.find(s => s.id == fixedFormData.subject_id)?.name;
    const confirmMsg = `⚠️ ยืนยันการลงวิชา "${subjectName}"\n\n - เป้าหมาย: ${levelLabel}\n - จำนวนห้อง: ${targetRooms.length} ห้อง\n - เวลา: วัน${fixedFormData.day_of_week} คาบที่ ${fixedFormData.slot_id}\n\nข้อมูลเดิมจะถูกทับ!`;
    if (!confirm(confirmMsg)) return;

    setIsLoading(true);
    try {
        const targetRoomIds = targetRooms.map(r => r.id);
        if (fixedFormData.delete_old) {
            await supabase.from("teaching_assignments").delete()
                .eq("academic_year", termInfo.year).eq("semester", termInfo.semester)
                .eq("day_of_week", fixedFormData.day_of_week).eq("slot_id", fixedFormData.slot_id)
                .in("classroom_id", targetRoomIds);
        }
        const insertPayload = targetRooms.map(room => ({
            classroom_id: room.id,
            subject_id: fixedFormData.subject_id,
            teacher_id: fixedFormData.teacher_id || null, 
            day_of_week: fixedFormData.day_of_week,
            slot_id: fixedFormData.slot_id,
            is_locked: true,
            major_group: fixedFormData.major_group,
            academic_year: termInfo.year,
            semester: termInfo.semester
        }));
        const { error } = await supabase.from("teaching_assignments").insert(insertPayload);
        if (error) throw error;
        alert(`✅ ลงวิชาสำเร็จให้ ${targetRooms.length} ห้อง (${levelLabel})!`);
        setIsFixedModalOpen(false);
        if (selectedRoom) fetchSchedule(); 
    } catch (err: any) { alert("เกิดข้อผิดพลาด: " + err.message); } 
    finally { setIsLoading(false); }
  }

  async function handleDelete(id: number) {
      await supabase.from("teaching_assignments").delete().eq("id", id);
      await fetchSchedule();
  }
  
  async function clearSchedule() {
      if(!confirm("ล้างตารางห้องนี้ทั้งหมด?")) return;
      setIsLoading(true);
      await supabase.from("teaching_assignments").delete().eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester);
      await fetchSchedule();
      setIsLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📅 จัดตารางสอน</h1>
            <p className="text-slate-500 text-sm">ปีการศึกษา {termInfo.year} เทอม {termInfo.semester}</p>
          </div>
          <div className="flex gap-2">
             <Link href="/print/timetable" target="_blank" className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-bold flex items-center gap-2 shadow-sm">
                🖨️ พิมพ์ตารางสอน (PDF)
             </Link>
             <Link href="/" className="px-4 py-2 bg-white border rounded-lg hover:bg-slate-50 text-sm font-bold shadow-sm">🏠 กลับหน้าหลัก</Link>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-slate-600">เลือกห้องเรียนเพื่อจัดตาราง</label>
            <select className="w-full p-2 border rounded-lg bg-slate-50 outline-none text-sm focus:ring-2 ring-indigo-500/20" 
                value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
                <option value="">-- เลือกห้องเรียน --</option>
                {classrooms.map(r => <option key={r.id} value={r.id}>ห้อง {r.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setIsFixedModalOpen(true)} className="flex-1 md:flex-none px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition shadow-sm flex items-center gap-2">
                ⚙️ ลงวิชาส่วนกลาง
            </button>
            <button onClick={handleAutoAssign} disabled={!selectedRoom} className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition shadow-sm disabled:opacity-50">
                🤖 จัดอัตโนมัติ
            </button>
            <button onClick={clearSchedule} disabled={!selectedRoom} className="flex-1 md:flex-none px-4 py-2 border border-red-200 text-red-600 rounded-lg font-bold text-sm hover:bg-red-50 transition disabled:opacity-50">
                🗑️ ล้างตาราง
            </button>
          </div>
        </div>

        {selectedRoom ? (
          <>
            {/* --- Main Timetable --- */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full border-collapse table-fixed">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-2 border-r font-bold sticky left-0 bg-slate-50 z-10 text-slate-500 text-xs" style={{width:'5%'}}>วัน</th>
                    {timeSlots.map(s => (
                      <th key={s.id} className="border-r last:border-0 text-center py-1 px-0.5" style={{width: s.isBreak ? '2%' : '9%'}}>
                        {s.isBreak ? (
                          <div className="text-[8px] text-slate-400 leading-tight">{s.label}</div>
                        ) : (
                          <>
                            <div className="text-[10px] font-bold text-indigo-900">{s.label}</div>
                            <div className="text-[8px] text-slate-400 font-normal leading-tight">{s.time}</div>
                          </>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {days.map(day => (
                    <tr key={day} className="hover:bg-slate-50/50 transition">
                      <td className="p-1 border-r bg-slate-50 font-bold text-center text-slate-600 sticky left-0 z-10 text-xs">{day}</td>
                      {timeSlots.map(slot => {
                        if (slot.isBreak) return (
                          <td key={slot.id} className="bg-slate-100/50 border-r" />
                        );
                        
                        const matches = scheduleData.filter(a => a.day_of_week === day && a.slot_id === Number(slot.id));
                        
                        return (
                          <td key={slot.id} className="border-r p-0.5 align-top relative group" style={{height:'112px'}}
                              onClick={() => { 
                                if (matches.length === 0) {
                                    setEditingId(null);
                                    setFormData({ subject_id: "", teacher_id: "", major_group: "ทั้งหมด", is_locked: true });
                                    setSubjectSearch("");
                                    setSubjectDropdownOpen(false);
                                    setTeacherSearch("");
                                    setTeacherDropdownOpen(false);
                                    setActiveSlot({ day, slotId: Number(slot.id) }); 
                                    setIsModalOpen(true); 
                                }
                              }}>
                            
                            {matches.length === 0 && (
                               <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition">
                                  <span className="text-indigo-400 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded-full">+</span>
                               </div>
                            )}

                            {matches.map((m) => (
                              <div key={m.id} 
                                onClick={(e) => { e.stopPropagation(); handleEditClick(m); }}
                                className={`h-full flex flex-col p-2 rounded-lg border shadow-sm relative mb-0.5 cursor-pointer hover:scale-[1.02] transition-all overflow-hidden
                                  ${m.is_locked ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-300' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                                
                                <button onClick={(e) => { e.stopPropagation(); if(m.id) handleDelete(m.id); }} 
                                    className="absolute top-0.5 right-0.5 bg-red-100 text-red-600 rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-200 shadow-sm z-20 text-[10px] leading-none">
                                    ×
                                </button>

                                <div className="font-bold text-indigo-900 line-clamp-3 text-[11px] leading-snug">{m.subjects?.name}</div>
                                <div className="text-slate-400 line-clamp-2 text-[9px] mt-1 leading-snug">{m.teachers?.full_name || "-"}</div>
                                <div className="mt-auto pt-1 flex justify-between items-center border-t border-slate-100/80">
                                    <span className="font-mono bg-slate-100 px-1 rounded text-[8px] text-slate-400 tracking-tight">{m.subjects?.code}</span>
                                    {m.is_locked && <span className="text-[9px] opacity-60">🔒</span>}
                                </div>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            


            {/* --- 📋 สรุปสถานะรายวิชาเทียบโครงสร้าง --- */}
            {structureSummary && (
              <div className={`rounded-xl border p-6 mt-4 ${structureSummary.some(i => i.placed < i.needed) ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      {structureSummary.some(i => i.placed < i.needed) ? '⚠️' : '✅'} สรุปสถานะรายวิชา
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      ลงแล้ว <span className="font-bold text-indigo-600">{structureSummary.reduce((s, i) => s + i.placed, 0)}</span> คาบ จากทั้งหมด <span className="font-bold">{structureSummary.reduce((s, i) => s + i.needed, 0)}</span> คาบที่ต้องการ
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* วิชาที่ลงไม่ครบ */}
                  {structureSummary.filter(i => i.placed < i.needed).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                        ลงไม่ครบ — ต้องจัดเพิ่มเอง ({structureSummary.filter(i => i.placed < i.needed).length} วิชา)
                      </div>
                      <div className="overflow-hidden rounded-lg border border-red-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-red-100/60 text-red-600 text-xs font-semibold">
                            <tr>
                              <th className="px-4 py-2 border-b border-red-200">รหัสวิชา</th>
                              <th className="px-4 py-2 border-b border-red-200">ชื่อวิชา</th>
                              <th className="px-4 py-2 border-b border-red-200">ครูผู้สอน</th>
                              <th className="px-4 py-2 border-b border-red-200 text-center">ลงได้</th>
                              <th className="px-4 py-2 border-b border-red-200 text-center">ขาด</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100 bg-white">
                            {structureSummary.filter(i => i.placed < i.needed).map(item => (
                              <tr key={item.subject_id} className="hover:bg-red-50 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="font-bold text-slate-600">{item.placed}/{item.needed}</span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="inline-block px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-bold text-xs">-{item.needed - item.placed} คาบ</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 italic">💡 สาเหตุ: ยังไม่ได้ลง หรือครูติดสอนห้องอื่นในช่วงเวลาที่เหลือ</p>
                    </div>
                  )}

                  {/* วิชาที่ลงครบ */}
                  {structureSummary.filter(i => i.placed === i.needed).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        ลงครบทุกคาบ ({structureSummary.filter(i => i.placed === i.needed).length} วิชา)
                      </div>
                      <div className="overflow-hidden rounded-lg border border-green-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-green-100/60 text-green-700 text-xs font-semibold">
                            <tr>
                              <th className="px-4 py-2 border-b border-green-200">รหัสวิชา</th>
                              <th className="px-4 py-2 border-b border-green-200">ชื่อวิชา</th>
                              <th className="px-4 py-2 border-b border-green-200">ครูผู้สอน</th>
                              <th className="px-4 py-2 border-b border-green-200 text-center">จำนวนคาบ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-100 bg-white">
                            {structureSummary.filter(i => i.placed === i.needed).map(item => (
                              <tr key={item.subject_id} className="hover:bg-green-50 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-xs">{item.placed} คาบ</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
              <div className="text-4xl mb-3">🏫</div>
              <div className="text-slate-400 font-medium text-sm">กรุณาเลือกห้องเรียนเพื่อเริ่มจัดการตาราง</div>
          </div>
        )}
      </div>

      {/* 📌 Modal: ลงวิชาปกติ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border" style={{overflow: 'visible'}}>
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">
                {editingId ? '📝 แก้ไขข้อมูลคาบเรียน' : `ลงวิชาห้อง ${classrooms.find(c => c.id === selectedRoom)?.name}`}
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); setSubjectDropdownOpen(false); setSubjectSearch(""); setTeacherDropdownOpen(false); setTeacherSearch(""); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-xs text-slate-500 font-bold uppercase mb-1">วัน{activeSlot?.day} คาบที่ {activeSlot?.slotId}</div>
              
              {/* Searchable Subject Dropdown */}
              <div className="relative">
                <div
                  className="w-full p-2 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                  onClick={() => setSubjectDropdownOpen(prev => !prev)}
                >
                  <span className={formData.subject_id ? "text-slate-800" : "text-slate-400"}>
                    {formData.subject_id
                      ? (() => { const s = subjects.find(s => s.id === formData.subject_id); return s ? `${s.code} - ${s.name}` : "-- เลือกวิชา --"; })()
                      : "-- เลือกวิชา --"}
                  </span>
                  <span className="text-slate-400 text-xs ml-2">{subjectDropdownOpen ? "▲" : "▼"}</span>
                </div>

                {subjectDropdownOpen && (
                  <div className="absolute z-30 bottom-full mb-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b">
                      <input
                        autoFocus
                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
                        placeholder="🔍 ค้นหารหัสหรือชื่อวิชา..."
                        value={subjectSearch}
                        onChange={e => setSubjectSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <div
                        className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
                        onClick={() => { setFormData({ ...formData, subject_id: "" }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}
                      >
                        -- เลือกวิชา --
                      </div>
                      {subjects
                        .filter(s =>
                          subjectSearch === "" ||
                          s.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                          s.name.toLowerCase().includes(subjectSearch.toLowerCase())
                        )
                        .map(s => (
                          <div
                            key={s.id}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${formData.subject_id === s.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`}
                            onClick={() => { setFormData({ ...formData, subject_id: s.id }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}
                          >
                            <span className="font-mono text-xs text-slate-400 mr-2">{s.code}</span>{s.name}
                          </div>
                        ))
                      }
                      {subjects.filter(s =>
                        subjectSearch !== "" && (
                          s.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                          s.name.toLowerCase().includes(subjectSearch.toLowerCase())
                        )
                      ).length === 0 && subjectSearch !== "" && (
                        <div className="px-3 py-3 text-sm text-slate-400 text-center">ไม่พบวิชาที่ค้นหา</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Searchable Teacher Dropdown with department grouping */}
              <div className="relative">
                <div
                  className="w-full p-2 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                  onClick={() => setTeacherDropdownOpen(prev => !prev)}
                >
                  <span className={formData.teacher_id ? "text-slate-800" : "text-slate-400"}>
                    {formData.teacher_id
                      ? teachers.find(t => t.id === formData.teacher_id)?.full_name || "-- เลือกครู --"
                      : "-- เลือกครู --"}
                  </span>
                  <span className="text-slate-400 text-xs ml-2">{teacherDropdownOpen ? "▲" : "▼"}</span>
                </div>

                {teacherDropdownOpen && (
                  <div className="absolute z-30 bottom-full mb-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b">
                      <input
                        autoFocus
                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
                        placeholder="🔍 ค้นหาชื่อครู..."
                        value={teacherSearch}
                        onChange={e => setTeacherSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      <div
                        className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer border-b"
                        onClick={() => { setFormData({ ...formData, teacher_id: "" }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}
                      >
                        -- เลือกครู --
                      </div>
                      {(() => {
                        const filtered = teachers.filter(t =>
                          teacherSearch === "" || t.full_name.toLowerCase().includes(teacherSearch.toLowerCase())
                        );
                        // จัดกลุ่มตาม department
                        const grouped = filtered.reduce((acc: Record<string, typeof teachers>, t) => {
                          const dept = t.department || "ไม่ระบุกลุ่มสาระ";
                          if (!acc[dept]) acc[dept] = [];
                          acc[dept].push(t);
                          return acc;
                        }, {});
                        const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'th'));
                        if (entries.length === 0) return (
                          <div className="px-3 py-3 text-sm text-slate-400 text-center">ไม่พบครูที่ค้นหา</div>
                        );
                        return entries.map(([dept, list]) => (
                          <div key={dept}>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-b border-t sticky top-0">
                              {dept}
                            </div>
                            {list.map(t => (
                              <div
                                key={t.id}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${formData.teacher_id === t.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`}
                                onClick={() => { setFormData({ ...formData, teacher_id: t.id }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}
                              >
                                {t.full_name}
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
              <input className="w-full p-2 border rounded-xl bg-slate-50 outline-none" placeholder="กลุ่มเรียน (Option)" value={formData.major_group} onChange={e => setFormData({ ...formData, major_group: e.target.value })} />
              <label className="flex items-center gap-2"><input type="checkbox" checked={formData.is_locked} onChange={e => setFormData({ ...formData, is_locked: e.target.checked })} /> ล็อกคาบนี้</label>
              <button onClick={handleSave} className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold mt-2">
                  {editingId ? 'บันทึกการแก้ไข' : 'เพิ่มคาบเรียน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚙️ Modal: ลงวิชาส่วนกลาง (คงเดิม) */}
      {isFixedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border ring-4 ring-amber-100">
            <div className="p-4 border-b bg-amber-50 flex justify-between items-center">
              <div>
                  <h3 className="font-bold text-amber-900 text-lg">⚙️ กำหนดวิชาส่วนกลาง</h3>
              </div>
              <button onClick={() => setIsFixedModalOpen(false)} className="text-amber-400 hover:text-amber-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">เป้าหมาย (ระดับชั้น)</label>
                <select className="w-full p-3 border rounded-xl bg-slate-50 font-bold text-slate-700" value={fixedFormData.target_level} onChange={e => setFixedFormData({ ...fixedFormData, target_level: e.target.value })}>
                    <option value="all">🌍 ทุกระดับชั้น</option>
                    {[1,2,3,4,5,6].map(lv => <option key={lv} value={lv}>ม.{lv}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={() => setIsFixedModalOpen(false)} className="flex-1 py-3 font-bold text-slate-400 text-sm">ยกเลิก</button>
                <button onClick={handleSaveGlobalSubject} disabled={isLoading} className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-xl font-bold shadow-lg hover:bg-amber-600 disabled:opacity-50 text-sm">
                  {isLoading ? "กำลังประมวลผล..." : "ยืนยันลงวิชา"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Loader */}
      {isLoading && (
        <div className="fixed bottom-5 right-5 bg-white p-3 rounded-xl shadow-2xl border flex items-center gap-2 z-[100]">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase">Processing...</span>
        </div>
      )}
    </div>
  );
}