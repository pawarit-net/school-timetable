"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function ManageAssignments() {
  // --- State เดิม ---
  const [selectedRoom, setSelectedRoom] = useState("");
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{day: string, slotId: number} | null>(null);
  
  const [formData, setFormData] = useState({
    subject_id: "",
    teacher_id: "", 
    major_group: "ทั้งหมด",
    is_locked: true
  });

  // --- State ใหม่ (สำหรับปีการศึกษา) ---
  const [termInfo, setTermInfo] = useState({ year: "2567", semester: "1" });

  const days = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
  const timeSlots = [
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

  useEffect(() => {
    loadInitialData();
  }, []);

  // เมื่อเปลี่ยนห้อง หรือ โหลดข้อมูลปีการศึกษาเสร็จ ให้โหลดตารางใหม่
  useEffect(() => {
    if (selectedRoom && termInfo.year) fetchSchedule();
  }, [selectedRoom, termInfo]);

  async function loadInitialData() {
    // 1. ดึงข้อมูลปีการศึกษาก่อน
    const { data: settings } = await supabase
      .from("academic_settings")
      .select("*")
      .single();
    
    if (settings) {
      setTermInfo({
        year: settings.year?.toString() || "2567",
        semester: settings.semester || "1"
      });
    }

    // 2. ดึงข้อมูลพื้นฐานอื่น ๆ
    const { data: rooms } = await supabase.from("classrooms").select("*").order('name');
    const { data: subs } = await supabase.from("subjects").select("*").order('code');
    const { data: tchs } = await supabase.from("teachers").select("*").order('full_name');
    
    if (rooms) setClassrooms(rooms);
    if (subs) setSubjects(subs);
    if (tchs) setTeachers(tchs);
  }

  async function fetchSchedule() {
    if (!termInfo.year) return; // ถ้ายังไม่รู้ปีการศึกษา อย่าเพิ่งโหลด

    const { data, error } = await supabase
      .from("teaching_assignments")
      .select(`
        *, 
        subjects(code, name), 
        teachers(full_name, department)
      `)
      .eq("classroom_id", selectedRoom)
      .eq("academic_year", termInfo.year) // กรองปี
      .eq("semester", termInfo.semester); // กรองเทอม (ใช้ semester ตามเดิม)
    
    if (error) console.error("Error fetching schedule:", error);
    if (data) setScheduleData(data);
  }

  // --- ฟังก์ชันล้างตารางสอน ---
  async function handleClearSchedule() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน!");
    if (!confirm(`⚠️ คุณแน่ใจไหมที่จะลบคาบเรียนที่ไม่ได้ 'ล็อก' ทั้งหมดของห้องนี้?\n(ปี ${termInfo.year} เทอม ${termInfo.semester})`)) return;

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
      alert("ล้างตารางเรียบร้อยแล้ว");
      fetchSchedule();
    }
  }

  // --- ระบบจัดตารางอัตโนมัติ (แก้ไขใหม่ ให้ตรง DB) ---
  async function handleAutoSchedule() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน!");
    if (!confirm(`ระบบจะเติมวิชาตามแผนการเรียน ปี ${termInfo.year} เทอม ${termInfo.semester} ยืนยันหรือไม่?`)) return;

    console.log("🔍 เริ่มต้นจัดตารางอัตโนมัติ...");

    // ✅ จุดที่แก้ไข: ดึงจาก course_structures และใช้ column "term"
    const { data: reqs, error } = await supabase
      .from("course_structures") 
      .select("*")
      .eq("classroom_id", selectedRoom)
      .eq("academic_year", termInfo.year)
      .eq("term", termInfo.semester); // <-- ใช้ term ตามรูปภาพ DB ของคุณ

    if (error) {
        console.error("❌ Error fetching course_structures:", error);
        alert("เกิดข้อผิดพลาดฐานข้อมูล: " + error.message);
        return;
    }

    if (!reqs || reqs.length === 0) {
      alert(`ไม่พบแผนการเรียน (Course Structure) ของห้องนี้!\nระบบค้นหา: ปี ${termInfo.year} เทอม ${termInfo.semester}\nกรุณาไปเพิ่มข้อมูลที่เมนู "โครงสร้างรายวิชา" ก่อน`);
      return;
    }

    console.log(`✅ พบแผนการเรียน ${reqs.length} วิชา, กำลังประมวลผล...`);

    let assignedCount = 0;

    for (const req of reqs) {
      // นับจำนวนคาบที่มีอยู่แล้วในเทอมนี้
      const alreadyAssigned = scheduleData.filter(s => s.subject_id === req.subject_id).length;
      let periodsToFill = req.periods_per_week - alreadyAssigned;

      if (periodsToFill <= 0) continue;

      for (const day of days) {
        for (const slot of timeSlots) {
          if (slot.isBreak || periodsToFill <= 0) continue;

          // เช็คว่าห้องนี้ว่างไหม
          const isOccupied = scheduleData.some(s => s.day_of_week === day && s.slot_id === slot.id);
          if (isOccupied) continue;

          // เช็คครูติดสอนไหม (Conflict Check)
          const { data: conflict } = await supabase
            .from("teaching_assignments")
            .select("id")
            .eq("teacher_id", req.teacher_id)
            .eq("day_of_week", day)
            .eq("slot_id", slot.id)
            .eq("academic_year", termInfo.year)
            .eq("semester", termInfo.semester) // เช็ค Conflict ยังคงใช้ semester ตามตาราง assignments
            .maybeSingle();

          if (conflict) continue;

          // Insert ลง teaching_assignments
          await supabase.from("teaching_assignments").insert([{
            classroom_id: selectedRoom,
            subject_id: req.subject_id,
            teacher_id: req.teacher_id,
            day_of_week: day,
            slot_id: slot.id,
            major_group: req.major_group || "ทั้งหมด",
            is_locked: false,
            academic_year: termInfo.year,
            semester: termInfo.semester   
          }]);

          assignedCount++;
          periodsToFill--;
          
          // อัปเดต state ชั่วคราว
          scheduleData.push({ 
             day_of_week: day, 
             slot_id: slot.id, 
             subject_id: req.subject_id 
          });
        }
      }
    }
    alert(`จัดตารางอัตโนมัติเสร็จสิ้น! (เพิ่ม ${assignedCount} คาบ)`);
    fetchSchedule();
  }

  // --- ฟังก์ชันบันทึกข้อมูล ---
  async function handleSave() {
    if (!formData.subject_id || !formData.teacher_id) {
      alert("กรุณาเลือกวิชาและครูผู้สอน");
      return;
    }

    // เช็ค Conflict ครู
    const { data: conflict } = await supabase
      .from("teaching_assignments")
      .select(`id, classrooms(name)`)
      .eq("teacher_id", formData.teacher_id)
      .eq("day_of_week", activeSlot?.day)
      .eq("slot_id", activeSlot?.slotId)
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester)
      .maybeSingle();

    if (conflict) {
      alert(`❌ ไม่สามารถจัดได้! ครูท่านนี้มีสอนที่ "ห้อง ${conflict.classrooms?.name}" ในคาบนี้แล้ว`);
      return;
    }

    // บันทึกข้อมูล
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

    if (error) {
      alert("บันทึกไม่สำเร็จ: " + error.message);
    } else {
      setIsModalOpen(false);
      fetchSchedule();
      setFormData({ subject_id: "", teacher_id: "", major_group: "ทั้งหมด", is_locked: true });
    }
  }

  async function handleDelete(id: number) {
    if (confirm("ต้องการลบคาบเรียนนี้ใช่ไหม?")) {
      await supabase.from("teaching_assignments").delete().eq("id", id);
      fetchSchedule();
    }
  }

  return (
    <div className="min-h-screen bg-white p-8 text-black pb-20">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
             <h1 className="text-3xl font-bold flex items-center gap-2">
               📅 ระบบจัดตารางสอนรายห้อง
             </h1>
             <p className="text-gray-500 text-sm mt-1">Drag & Drop หรือคลิกเพื่อเพิ่มวิชาเรียน</p>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-end md:items-center">
             {/* Year/Term Badge */}
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

             <Link href="/" className="bg-gray-100 px-4 py-2 rounded-lg border hover:bg-gray-200 h-12 flex items-center font-bold text-gray-600">
                🏠 กลับ
             </Link>
          </div>
        </div>

        {/* Toolbar Section */}
        <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col md:flex-row justify-between items-end gap-4">
          <div className="w-full md:w-auto">
             <label className="block text-sm font-bold mb-2 text-blue-900">เลือกห้องเรียนเพื่อจัดการตาราง:</label>
             <select 
               className="w-full md:w-72 p-3 border-2 border-white rounded-xl shadow-sm outline-none focus:border-blue-500 text-black"
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
              className="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-bold border border-red-200 hover:bg-red-100 transition shadow-sm flex items-center gap-2"
            >
              🗑️ ล้างตาราง
            </button>
            <button 
              onClick={handleAutoSchedule}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-md flex items-center gap-2"
            >
              🤖 จัดอัตโนมัติ
            </button>
          </div>
        </div>

        {/* Table Section */}
        {selectedRoom && (
          <div className="bg-white rounded-3xl border shadow-sm overflow-hidden overflow-x-auto">
            <div className="min-w-[1000px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="p-4 border-r text-gray-500 font-medium w-24">วัน / เวลา</th>
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
                      <tr key={day} className="border-b last:border-0">
                        <td className="p-4 border-r bg-gray-50 font-bold text-center text-sm text-gray-700">{day}</td>
                        {timeSlots.map(slot => {
                          if (slot.isBreak) return <td key={slot.id} className="bg-gray-50 border-r text-[10px] text-gray-400 text-center italic">พัก</td>;
                          
                          const matches = scheduleData.filter(a => a.day_of_week === day && a.slot_id === slot.id);

                          return (
                            <td 
                              key={slot.id} 
                              className="border-r p-1 h-28 relative hover:bg-blue-50/50 transition cursor-pointer group align-top"
                              onClick={() => { setActiveSlot({day, slotId: Number(slot.id)}); setIsModalOpen(true); }}
                            >
                              {matches.length > 0 ? (
                                <div className="space-y-1 h-full w-full">
                                  {matches.map(m => (
                                    <div key={m.id} className={`p-1.5 rounded-lg border shadow-sm relative ${m.is_locked ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
                                      <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-blue-900 text-[10px] leading-tight block truncate w-[85%]">{m.subjects?.code} {m.subjects?.name}</span>
                                        <button onClick={(e) => {e.stopPropagation(); handleDelete(m.id)}} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition absolute top-1 right-1 z-10 bg-white/50 rounded-full p-0.5">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div className="text-[9px] text-gray-700 font-medium truncate">👤 {m.teachers?.full_name}</div>
                                      <div className="flex justify-between items-end mt-1">
                                         <div className="text-[8px] text-pink-500 font-bold uppercase tracking-tighter bg-pink-50 px-1 rounded">{m.major_group}</div>
                                         {m.is_locked && <span className="text-[10px]">🔒</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : <span className="text-gray-200 text-[10px] flex h-full items-center justify-center group-hover:text-blue-300 transition">+ เพิ่ม</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200 text-black">
              <h2 className="text-xl font-bold mb-6 text-blue-900 border-b pb-4">📝 จัดวิชา: {activeSlot?.day} (คาบที่ {activeSlot?.slotId})</h2>
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">วิชาเรียน</label>
                  <select className="w-full border-2 p-3 rounded-xl outline-none focus:border-blue-500 text-black" value={formData.subject_id} onChange={(e) => setFormData({...formData, subject_id: e.target.value})}>
                    <option value="">-- เลือกวิชา --</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">ครูผู้สอน</label>
                  <select className="w-full border-2 p-3 rounded-xl outline-none focus:border-blue-500 text-black" value={formData.teacher_id} onChange={(e) => setFormData({...formData, teacher_id: e.target.value})}>
                    <option value="">-- เลือกครู --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name} {t.department ? `(${t.department})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">สายการเรียน / กลุ่มเรียน</label>
                  <input type="text" className="w-full border-2 p-3 rounded-xl outline-none focus:border-blue-500 text-black" value={formData.major_group} onChange={(e) => setFormData({...formData, major_group: e.target.value})} placeholder="เช่น ม.1/1, วิทย์-คณิต" />
                </div>
                <div className="flex items-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <input type="checkbox" className="w-5 h-5 accent-orange-500 mr-3" checked={formData.is_locked} onChange={(e) => setFormData({...formData, is_locked: e.target.checked})} />
                  <span className="text-sm font-bold text-orange-700">🔒 ล็อกคาบนี้ (ห้ามจัดอัตโนมัติมาทับ)</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-8">
                <button onClick={() => setIsModalOpen(false)} className="py-3 font-bold text-gray-400 hover:text-gray-600 transition">ยกเลิก</button>
                <button onClick={handleSave} className="bg-blue-600 text-white py-3 rounded-2xl font-bold hover:bg-blue-700 shadow-lg transition active:scale-95">บันทึกลงตาราง</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}