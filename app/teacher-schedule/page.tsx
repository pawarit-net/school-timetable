"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from '@/lib/supabaseClient';
import Link from "next/link";

export default function TeacherSchedule() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [scheduleData, setScheduleData] = useState<any[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{day: string, slotId: number} | null>(null);
  const [meetingNote, setMeetingNote] = useState("ประชุมหมวด/PLC");

  const [academicYear, setAcademicYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<string | null>(null);
  const settingsLoaded = useRef(false);

  const [targetScope, setTargetScope] = useState<'current' | 'department' | 'all'>('current');
  const [isProcessing, setIsProcessing] = useState(false);

  // Confirm modal แทน confirm()
  const [confirmModal, setConfirmModal] = useState<{open: boolean, msg: string, onOk: () => void} | null>(null);
  // Toast แทน alert()
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

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

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function showConfirm(msg: string, onOk: () => void) {
    setConfirmModal({ open: true, msg, onOk });
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  // fetch เฉพาะหลัง settings โหลดแล้วเท่านั้น
  useEffect(() => {
    if (!settingsLoaded.current) return;
    if (selectedTeacher && academicYear !== null && semester !== null) {
      fetchSchedule(selectedTeacher, academicYear, semester);
    } else {
      setScheduleData([]);
    }
  }, [selectedTeacher, academicYear, semester]);

  async function loadInitialData() {
    const { data: tchs } = await supabase
      .from("teachers")
      .select("*")
      .order("department", { ascending: true })
      .order("full_name", { ascending: true });
    if (tchs) setTeachers(tchs);

    const { data: settings } = await supabase
      .from("academic_settings")
      .select("*")
      .eq("id", 1)
      .single();

    // set ค่าจาก DB โดยตรง
    const yr = settings?.year ?? 2569;
    const sm = String(settings?.semester ?? "1");
    setAcademicYear(yr);
    setSemester(sm);
    settingsLoaded.current = true;
  }

  async function fetchSchedule(teacherId: string, year: number, sem: string) {
    const { data } = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(name, code), classrooms(name)`)
      .eq("teacher_id", teacherId)
      .eq("academic_year", year)
      .eq("semester", sem);
    if (data) setScheduleData(data);
  }

  const uniqueDepartments = Array.from(new Set(teachers.map(t => t.department || "ไม่ระบุหมวด")));

  async function handleSetMeeting() {
    if (!activeSlot || !selectedTeacher || academicYear === null || semester === null) return;
    setIsProcessing(true);
    try {
      let teacherIdsToUpdate: any[] = [];
      if (targetScope === 'current') {
        teacherIdsToUpdate = [selectedTeacher];
      } else if (targetScope === 'all') {
        teacherIdsToUpdate = teachers.map(t => t.id);
      } else if (targetScope === 'department') {
        const currentTeacherInfo = teachers.find(t => String(t.id) === String(selectedTeacher));
        if (currentTeacherInfo?.department) {
          teacherIdsToUpdate = teachers
            .filter(t => t.department === currentTeacherInfo.department)
            .map(t => t.id);
        } else {
          showToast("ครูท่านนี้ไม่ได้ระบุหมวดวิชา", "error");
          setIsProcessing(false);
          return;
        }
      }

      const confirmMsg = targetScope === 'current'
        ? "ยืนยันการล็อกคาบนี้?"
        : `⚠️ จะล็อกคาบนี้ให้ครู ${teacherIdsToUpdate.length} ท่าน\nข้อมูลเก่าจะถูกลบ ยืนยัน?`;

      showConfirm(confirmMsg, async () => {
        setConfirmModal(null);
        await supabase
          .from("teaching_assignments")
          .delete()
          .in("teacher_id", teacherIdsToUpdate)
          .eq("day_of_week", activeSlot.day)
          .eq("slot_id", activeSlot.slotId)
          .eq("academic_year", academicYear)
          .eq("semester", semester);

        const newAssignments = teacherIdsToUpdate.map(tId => ({
          teacher_id: tId,
          day_of_week: activeSlot.day,
          slot_id: activeSlot.slotId,
          academic_year: academicYear,
          semester: semester,
          activity_type: 'meeting',
          note: meetingNote,
          is_locked: true
        }));

        const { error } = await supabase.from("teaching_assignments").insert(newAssignments);
        if (error) throw error;

        showToast(`✅ ล็อกคาบให้ครู ${teacherIdsToUpdate.length} ท่านแล้ว`);
        setIsModalOpen(false);
        fetchSchedule(selectedTeacher, academicYear, semester);
        setIsProcessing(false);
      });
    } catch (err: any) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error");
      setIsProcessing(false);
    }
  }

  async function handleMakeFree() {
    if (!activeSlot || academicYear === null || semester === null) return;
    let teacherIdsToDelete: any[] = [];
    if (targetScope === 'current') {
      teacherIdsToDelete = [selectedTeacher];
    } else if (targetScope === 'all') {
      teacherIdsToDelete = teachers.map(t => t.id);
    } else if (targetScope === 'department') {
      const cur = teachers.find(t => String(t.id) === String(selectedTeacher));
      if (cur?.department) {
        teacherIdsToDelete = teachers.filter(t => t.department === cur.department).map(t => t.id);
      }
    }

    showConfirm(`เคลียร์คาบนี้ให้ว่าง (${targetScope === 'current' ? 'คนเดียว' : `${teacherIdsToDelete.length} คน`})?`, async () => {
      setConfirmModal(null);
      await supabase
        .from("teaching_assignments")
        .delete()
        .in("teacher_id", teacherIdsToDelete)
        .eq("day_of_week", activeSlot.day)
        .eq("slot_id", activeSlot.slotId)
        .eq("academic_year", academicYear)
        .eq("semester", semester);
      setIsModalOpen(false);
      fetchSchedule(selectedTeacher, academicYear, semester);
    });
  }

  if (academicYear === null || semester === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-black">
      <div className="max-w-7xl mx-auto">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
            {toast.msg}
          </div>
        )}

        {/* Confirm Modal */}
        {confirmModal?.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <p className="text-slate-700 text-sm whitespace-pre-line">{confirmModal.msg}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
                <button onClick={confirmModal.onOk} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">ยืนยัน</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">👤 ตารางสอนรายบุคคล</h1>
            <p className="text-gray-500 text-sm mt-1">จัดการคาบสอน กิจกรรม และล็อกเวลาประชุมของครู</p>
          </div>
          <Link href="/" className="bg-white border px-4 py-2 rounded-lg hover:bg-gray-100 shadow-sm transition">⬅ กลับหน้าหลัก</Link>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border mb-6 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">เลือกครูผู้สอน</label>
            <select className="w-full p-3 border-2 rounded-xl bg-gray-50 outline-none focus:border-purple-500 transition"
              value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)}>
              <option value="">-- เลือกรายชื่อครู --</option>
              {uniqueDepartments.map((dept: any) => (
                <optgroup key={dept} label={dept}>
                  {teachers.filter(t => (t.department || "ไม่ระบุหมวด") === dept).map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ปีการศึกษา</label>
            <input type="number" value={academicYear}
              onChange={(e) => setAcademicYear(Number(e.target.value))}
              className="w-full p-3 border rounded-xl bg-gray-50 text-center font-bold" />
          </div>
          <div className="w-32">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">เทอม</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className="w-full p-3 border rounded-xl bg-gray-50 font-bold">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="Summer">Summer</option>
            </select>
          </div>
          {/* แสดงปี/เทอมที่กำลังดูอยู่ */}
          <div className="bg-indigo-50 px-4 py-3 rounded-xl border border-indigo-100 text-indigo-700 text-sm font-medium">
            📅 ปี {academicYear} เทอม {semester}
          </div>
        </div>

        {/* Schedule Table */}
        {selectedTeacher ? (
          <div className="bg-white rounded-3xl border shadow-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="p-4 border-r text-gray-500 font-medium w-24">วัน</th>
                  {timeSlots.map(s => (
                    <th key={s.id} className="p-2 text-xs border-r last:border-0 min-w-[100px]">
                      <div className="font-bold text-gray-700">{s.label}</div>
                      <div className="text-gray-400 font-normal text-[10px]">{s.time}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(day => (
                  <tr key={day} className="border-b last:border-0">
                    <td className="p-4 border-r bg-gray-50 font-bold text-center text-gray-700">{day}</td>
                    {timeSlots.map(slot => {
                      if (slot.isBreak) return <td key={slot.id} className="bg-gray-50 border-r text-[10px] text-gray-300 text-center italic">พัก</td>;
                      const match = scheduleData.find(a => a.day_of_week === day && a.slot_id === slot.id);
                      let cellClass = "bg-white hover:bg-gray-50";
                      if (match) {
                        if (match.activity_type === 'meeting') cellClass = "bg-orange-100 hover:bg-orange-200 ring-inset ring-2 ring-orange-200";
                        else cellClass = "bg-blue-50 hover:bg-blue-100 ring-inset ring-2 ring-blue-100";
                      }
                      return (
                        <td key={slot.id}
                          className={`border-r p-2 h-28 text-center cursor-pointer transition relative group ${cellClass}`}
                          onClick={() => {
                            setActiveSlot({ day, slotId: Number(slot.id) });
                            setTargetScope('current');
                            setMeetingNote(match?.activity_type === 'meeting' ? (match.note || "ประชุม") : "ประชุมหมวด/PLC");
                            setIsModalOpen(true);
                          }}>
                          {match ? (
                            match.activity_type === 'meeting' ? (
                              <div className="flex flex-col items-center justify-center h-full text-orange-800">
                                <span className="text-2xl mb-1">📅</span>
                                <span className="text-xs font-bold leading-tight">{match.note}</span>
                                <span className="text-[9px] bg-orange-200 px-1.5 py-0.5 rounded mt-1 font-semibold opacity-70">LOCKED</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-blue-900">
                                <span className="font-bold text-sm mb-1">{match.subjects?.code}</span>
                                <span className="text-[10px] leading-tight line-clamp-2 px-1">{match.subjects?.name}</span>
                                <span className="text-[9px] bg-white border border-blue-200 px-2 py-0.5 rounded-full mt-2 shadow-sm text-blue-500 font-medium">
                                  ห้อง {match.classrooms?.name || "-"}
                                </span>
                              </div>
                            )
                          ) : (
                            <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <span className="text-gray-300 text-2xl">+</span>
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
        ) : (
          <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-3xl border border-dashed">
            เลือกครูผู้สอนเพื่อเริ่มจัดการตาราง
          </div>
        )}

        {/* Modal จัดการคาบ */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-3 flex justify-between items-center">
                <span>จัดการตารางเวลา</span>
                <span className="text-xs font-normal bg-gray-100 px-2 py-1 rounded text-gray-500">{activeSlot?.day} คาบ {activeSlot?.slotId}</span>
              </h3>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อกิจกรรม / ประชุม</label>
                  <input type="text"
                    className="w-full border p-2 rounded-lg text-sm outline-none bg-gray-50 focus:bg-white focus:ring-2 focus:ring-orange-200 transition"
                    placeholder="เช่น ประชุมหมวด, อบรม"
                    value={meetingNote} onChange={(e) => setMeetingNote(e.target.value)} />
                </div>
                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                  <label className="text-xs font-bold text-blue-800 block mb-2">เลือกเป้าหมายที่จะล็อก:</label>
                  <div className="space-y-2">
                    {[
                      { value: 'current', label: 'เฉพาะครูคนนี้ (คนเดียว)', accent: 'accent-blue-600' },
                      { value: 'department', label: 'ทั้งหมวดสาระฯ เดียวกัน', accent: 'accent-blue-600' },
                      { value: 'all', label: 'ครูทุกคน (ทั้งโรงเรียน) ⚠️', accent: 'accent-red-600' },
                    ].map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1 rounded transition">
                        <input type="radio" name="scope" value={opt.value}
                          checked={targetScope === opt.value}
                          onChange={() => setTargetScope(opt.value as any)}
                          className={opt.accent} />
                        <span className={targetScope === 'all' && opt.value === 'all' ? "font-bold text-red-600" : ""}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSetMeeting} disabled={isProcessing}
                    className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 shadow-md active:scale-95 transition disabled:opacity-50">
                    {isProcessing ? "กำลังบันทึก..." : "🔒 ล็อกเวลา"}
                  </button>
                  <button onClick={handleMakeFree} disabled={isProcessing}
                    className="px-4 border border-gray-200 text-gray-500 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                    title="ลบข้อมูลให้ว่าง">🗑️</button>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-xs text-center text-gray-400 hover:underline">ปิดหน้าต่าง</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}