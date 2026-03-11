"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient'
import Link from "next/link";

// --- Levenshtein similarity ---
function strSimilarity(a: string, b: string): number {
  a = a.trim().toLowerCase();
  b = b.trim().toLowerCase();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

function fuzzyGroupTeachers(teachers: Teacher[], threshold = 0.8): Record<string, Teacher[]> {
  const canonicals: string[] = [];
  const groups: Record<string, Teacher[]> = {};
  for (const t of teachers) {
    const dept = t.department?.trim() || "ไม่ระบุกลุ่มสาระ";
    let matched = canonicals.find(c => strSimilarity(c, dept) >= threshold);
    if (!matched) { matched = dept; canonicals.push(dept); groups[dept] = []; }
    groups[matched].push(t);
  }
  return groups;
}

const ADJACENT_SLOT_PAIRS: [number, number][] = [
  [1, 2], [3, 4], [5, 6], [6, 7],
];
function areSlotsAdjacent(slotA: number, slotB: number): boolean {
  return ADJACENT_SLOT_PAIRS.some(([a, b]) => (a === slotA && b === slotB) || (a === slotB && b === slotA));
}
function isMathSubject(subjectName: string): boolean {
  return subjectName.includes("คณิต");
}
function wouldViolateMathAdjacentRule(
  newSubjectName: string, newSlotId: number,
  existingSlotsInDay: { slot_id: number; subjectName: string }[]
): boolean {
  if (!isMathSubject(newSubjectName)) return false;
  return existingSlotsInDay.some(e => isMathSubject(e.subjectName) && areSlotsAdjacent(newSlotId, e.slot_id));
}

function getLevelPrefixFromRoomName(roomName: string): string | null {
  const name = roomName.trim();
  if (/^6|^ม\.?\s*6/.test(name)) return "33";
  if (/^5|^ม\.?\s*5/.test(name)) return "32";
  if (/^4|^ม\.?\s*4/.test(name)) return "31";
  if (/^3|^ม\.?\s*3/.test(name)) return "23";
  if (/^2|^ม\.?\s*2/.test(name)) return "22";
  if (/^1|^ม\.?\s*1/.test(name)) return "21";
  return null;
}
function getLevelPrefixFromTargetLevel(level: string): string | null {
  const map: Record<string, string> = { "6": "33", "5": "32", "4": "31", "3": "23", "2": "22", "1": "21" };
  return map[level] ?? null;
}
function naturalSort(a: string, b: string): number {
  const parse = (s: string) => {
    const m = s.trim().match(/^(\d+)\/(\d+)(.*)/);
    if (m) return { grade: parseInt(m[1]), room: parseInt(m[2]), suffix: m[3].trim() };
    const m2 = s.trim().match(/^(\d+)(.*)/);
    if (m2) return { grade: parseInt(m2[1]), room: 0, suffix: m2[2].trim() };
    return { grade: 0, room: 0, suffix: s };
  };
  const pa = parse(a), pb = parse(b);
  if (pa.grade !== pb.grade) return pa.grade - pb.grade;
  if (pa.room !== pb.room) return pa.room - pb.room;
  return pa.suffix.localeCompare(pb.suffix, 'th');
}

interface TimeSlot { id: number | string; label: string; time: string; isBreak?: boolean; }
interface Classroom { id: string; name: string; }
interface Subject { id: string; code: string; name: string; }
interface Teacher { id: string; full_name: string; department?: string; }
interface ScheduleItem {
  id?: number; classroom_id?: string; day_of_week: string; slot_id: number;
  subject_id: string; teacher_id?: string; is_locked?: boolean;
  academic_year?: string; semester?: string; major_group?: string;
  activity_type?: string; note?: string;
  subjects?: { code: string; name: string };
  teachers?: { full_name: string; department: string };
}

const MAX_TEACHERS = 3;

export default function ManageAssignments() {
  const [selectedRoom, setSelectedRoom] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [activeSlot, setActiveSlot] = useState<{ day: string, slotId: number } | null>(null);
  const [termInfo, setTermInfo] = useState({ year: "2569", semester: "3" });
  const [editingId, setEditingId] = useState<number | null>(null);

  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  // number = index ของ slot ที่ dropdown เปิดอยู่, false = ปิดทั้งหมด
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState<number | false>(false);

  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<"unlocked" | "all">("unlocked");
  const [courseStructures, setCourseStructures] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    subject_id: "",
    teacher_ids: [""] as string[], // 1-3 คน
    major_group: "ทั้งหมด",
    is_locked: true
  });

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

  const fuzzyGroupedTeachers = useMemo(() => {
    const grouped = fuzzyGroupTeachers(teachers, 0.8);
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'th'));
  }, [teachers]);

  const subjectsForSelectedRoom = useMemo(() => {
    const roomName = classrooms.find(c => c.id === selectedRoom)?.name || "";
    const prefix = getLevelPrefixFromRoomName(roomName);
    if (!prefix) return subjects;
    return subjects.filter(s => s.code.startsWith(prefix));
  }, [subjects, classrooms, selectedRoom]);

  const subjectsForFixedModal = useMemo(() => {
    const prefix = getLevelPrefixFromTargetLevel(fixedFormData.target_level);
    if (!prefix) return subjects;
    return subjects.filter(s => s.code.startsWith(prefix));
  }, [subjects, fixedFormData.target_level]);

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

  const realSlotIds = timeSlots.filter(s => !s.isBreak).map(s => Number(s.id));

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { if (selectedRoom) fetchSchedule(); }, [selectedRoom, termInfo]);

  // ── Realtime: subscribe เฉพาะห้องที่เลือกอยู่ ──
  useEffect(() => {
    if (!selectedRoom) return;
    const channel = supabase
      .channel(`timetable-room-${selectedRoom}-${termInfo.year}-${termInfo.semester}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'teaching_assignments',
        filter: `classroom_id=eq.${selectedRoom}`
      }, () => {
        fetchSchedule();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedRoom, termInfo]);

  async function loadInitialData() {
    setIsLoading(true);
    try {
      const { data: settings } = await supabase.from("academic_settings").select("*").single();
      if (settings) setTermInfo({ year: settings.year?.toString() || "2569", semester: settings.semester || "3" });
      const [rooms, subs, tchs] = await Promise.all([
        supabase.from("classrooms").select("id, name"),
        supabase.from("subjects").select("id, code, name").order('code'),
        supabase.from("teachers").select("id, full_name, department").order('full_name')
      ]);
      if (rooms.data) setClassrooms([...rooms.data].sort((a, b) => naturalSort(a.name, b.name)));
      if (subs.data) setSubjects(subs.data);
      if (tchs.data) setTeachers(tchs.data);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchSchedule(roomId?: string, year?: string, semester?: string) {
    const room = roomId ?? selectedRoom;
    const yr = year ?? termInfo.year;
    const sem = semester ?? termInfo.semester;
    if (!room) return;
    setIsLoading(true);
    try {
      const [assignRes, structRes] = await Promise.all([
        supabase.from("teaching_assignments")
          .select(`*, subjects(code, name), teachers(full_name, department)`)
          .eq("classroom_id", room).eq("academic_year", yr).eq("semester", sem),
        supabase.from("course_structures")
          .select(`*, course_teachers(teacher_id)`)
          .eq("classroom_id", room).eq("academic_year", yr).eq("term", sem)
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
    // โหลดครูทุกคนในคาบนั้น (กรณีมีหลายคน)
    const teachersInSlot = scheduleData
      .filter(a => a.day_of_week === item.day_of_week && a.slot_id === item.slot_id && a.subject_id === item.subject_id)
      .map(a => a.teacher_id || "")
      .filter(Boolean);
    setFormData({
      subject_id: item.subject_id,
      teacher_ids: teachersInSlot.length > 0 ? teachersInSlot : [""],
      major_group: item.major_group || "ทั้งหมด",
      is_locked: item.is_locked || false
    });
    setSubjectSearch(""); setSubjectDropdownOpen(false);
    setTeacherSearch(""); setTeacherDropdownOpen(false);
    setIsModalOpen(true);
  };

  async function handleSave() {
    if (!formData.subject_id || !activeSlot) return;

    const newSubjectName = subjects.find(s => s.id === formData.subject_id)?.name || "";
    if (isMathSubject(newSubjectName)) {
      const slotsInDay = scheduleData
        .filter(a => a.day_of_week === activeSlot.day && a.id !== editingId)
        .map(a => ({ slot_id: a.slot_id, subjectName: a.subjects?.name || "" }));
      if (wouldViolateMathAdjacentRule(newSubjectName, activeSlot.slotId, slotsInDay)) {
        const proceed = confirm(`⚠️ คำเตือน: "${newSubjectName}" จะอยู่ติดกับวิชากลุ่มคณิตอีกวิชา\nต้องการลงต่อไปหรือไม่?`);
        if (!proceed) return;
      }
    }

    const isSlotChanging = !editingId ||
      scheduleData.find(a => a.id === editingId)?.slot_id !== activeSlot.slotId ||
      scheduleData.find(a => a.id === editingId)?.day_of_week !== activeSlot.day;

    if (isSlotChanging) {
      const { data: slotAssigns } = await supabase
        .from("teaching_assignments").select("teacher_id, classroom_id, activity_type")
        .eq("academic_year", termInfo.year).eq("semester", termInfo.semester)
        .eq("day_of_week", activeSlot.day).eq("slot_id", activeSlot.slotId)
        .neq("id", editingId ?? -1);

      const warnings: string[] = [];
      const validTeacherIds = formData.teacher_ids.filter(id => id !== "");
      for (const tid of validTeacherIds) {
        const teacherBusy = (slotAssigns || []).some(a => String(a.teacher_id) === String(tid));
        if (teacherBusy) {
          const tName = teachers.find(t => t.id === tid)?.full_name || "ครูคนนี้";
          warnings.push(`👤 "${tName}" มีคาบสอนในเวลานี้อยู่แล้ว`);
        }
      }
      const roomBusy = (slotAssigns || []).some(a => String(a.classroom_id) === String(selectedRoom));
      if (roomBusy) {
        const rName = classrooms.find(r => r.id === selectedRoom)?.name || "ห้องนี้";
        warnings.push(`🏫 ห้อง "${rName}" มีวิชาสอนในคาบนี้อยู่แล้ว`);
      }
      if (warnings.length > 0) {
        const proceed = confirm(`⚠️ พบปัญหา ${warnings.length} รายการ:\n\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n\nต้องการลงต่อไปหรือไม่?`);
        if (!proceed) return;
      }
    }

    setIsLoading(true);

    const validTeacherIds = formData.teacher_ids.filter(id => id !== "");
    const basePayload = {
      classroom_id: selectedRoom,
      subject_id: formData.subject_id,
      teacher_id: validTeacherIds[0] || null,
      day_of_week: activeSlot.day,
      slot_id: activeSlot.slotId,
      is_locked: formData.is_locked,
      major_group: formData.major_group,
      academic_year: termInfo.year,
      semester: termInfo.semester
    };

    let error;
    if (editingId) {
      // ลบแถวครูคนอื่นๆ ในคาบเดียวกันก่อน (กรณีเปลี่ยนจาก 3 คน → 1 คน)
      await supabase.from("teaching_assignments").delete()
        .eq("classroom_id", selectedRoom)
        .eq("day_of_week", activeSlot.day)
        .eq("slot_id", activeSlot.slotId)
        .eq("subject_id", formData.subject_id)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .neq("id", editingId);
      const { error: updateError } = await supabase
        .from("teaching_assignments").update(basePayload).eq("id", editingId);
      error = updateError;
      if (!error && validTeacherIds.length > 1) {
        const extra = validTeacherIds.slice(1).map(tid => ({ ...basePayload, teacher_id: tid }));
        const { error: e2 } = await supabase.from("teaching_assignments").insert(extra);
        error = e2;
      }
    } else {
      const { error: insertError } = await supabase
        .from("teaching_assignments").insert([basePayload]);
      error = insertError;
      if (!error && validTeacherIds.length > 1) {
        const extra = validTeacherIds.slice(1).map(tid => ({ ...basePayload, teacher_id: tid }));
        const { error: e2 } = await supabase.from("teaching_assignments").insert(extra);
        error = e2;
      }
    }

    if (!error) {
      setIsModalOpen(false); setEditingId(null);
      await fetchSchedule();
    } else {
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
    setIsLoading(false);
  }

  const summaryList = Object.values(scheduleData.reduce((acc: any, item) => {
    const key = `${item.subject_id}-${item.teacher_id || 'null'}`;
    if (!acc[key]) acc[key] = { id: key, code: item.subjects?.code || "-", name: item.subjects?.name || "ไม่ระบุ", teacher: item.teachers?.full_name || "-", count: 0 };
    acc[key].count++;
    return acc;
  }, {})).sort((a: any, b: any) => a.code.localeCompare(b.code));

  const totalPeriods = (summaryList as any[]).reduce((sum, item) => sum + item.count, 0);

  const structureSummary = courseStructures.length > 0
    ? courseStructures.map((s: any) => {
        const subjectInfo = subjects.find(sub => sub.id === s.subject_id);
        const teacherId = s.course_teachers?.[0]?.teacher_id || null;
        const teacherInfo = teachers.find(t => t.id === teacherId);
        const needed = s.periods_per_week || 1;
        // นับ unique คาบ (day+slot) ไม่นับซ้ำกรณีมีหลายครูในคาบเดียวกัน
        const uniqueSlots = new Set(
          scheduleData
            .filter(a => a.subject_id === s.subject_id && !a.activity_type)
            .map(a => `${a.day_of_week}-${a.slot_id}`)
        );
        const placed = uniqueSlots.size;
        return { subject_id: s.subject_id, subject_code: subjectInfo?.code || "-", subject_name: subjectInfo?.name || s.subject_id, teacher_name: teacherInfo?.full_name || "-", needed, placed };
      }).sort((a: any, b: any) => a.subject_code.localeCompare(b.subject_code))
    : null;

  async function handleAutoAssign() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน");
    const mode = confirm(`ต้องการ "ล้างตารางเดิมทั้งหมด" ก่อนจัดใหม่หรือไม่?\n\n[OK] = ล้างแล้วจัดใหม่\n[Cancel] = เติมเฉพาะช่องว่าง`) ? 'reset' : 'fill';
    setIsLoading(true);
    try {
      // ── 1. โหลดโครงสร้างรายวิชาของห้องนี้ ──
      const { data: structures, error: structError } = await supabase
        .from("course_structures").select(`*, course_teachers(teacher_id)`)
        .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("term", termInfo.semester);
      if (structError || !structures || structures.length === 0) {
        alert("⚠️ ไม่พบข้อมูลโครงสร้างรายวิชาของห้องนี้"); return;
      }

      // ── 2. คำนวณ max คาบ/วัน ของแต่ละครู จาก course_structures ทั้งโรงเรียน ──
      const { data: allStructures } = await supabase
        .from("course_structures")
        .select(`periods_per_week, course_teachers(teacher_id)`)
        .eq("academic_year", termInfo.year)
        .eq("term", termInfo.semester);

      const teacherWeeklyLoad: Record<string, number> = {};
      for (const s of (allStructures || [])) {
        for (const ct of (s.course_teachers || [])) {
          const tid = String(ct.teacher_id);
          teacherWeeklyLoad[tid] = (teacherWeeklyLoad[tid] || 0) + (s.periods_per_week || 1);
        }
      }
      // max คาบ/วัน = ceil(total/5) แต่ไม่เกิน 5
      const teacherMaxPerDay: Record<string, number> = {};
      for (const [tid, total] of Object.entries(teacherWeeklyLoad)) {
        teacherMaxPerDay[tid] = Math.min(5, Math.ceil(total / 5));
      }

      // ── 3. ล้างตาราง (ถ้าเลือก reset) ──
      if (mode === 'reset') {
        await supabase.from("teaching_assignments").delete()
          .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year)
          .eq("semester", termInfo.semester).eq("is_locked", false);
      }

      // ── 4. โหลด existing assignments (รวม activity_type เพื่อจับคาบประชุม) ──
      const { data: existing } = await supabase.from("teaching_assignments")
        .select("day_of_week, slot_id, teacher_id, subject_id, activity_type")
        .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester);

      const { data: allRoomsExisting } = await supabase.from("teaching_assignments")
        .select("day_of_week, slot_id, teacher_id, classroom_id, activity_type")
        .neq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester);

      // ── 5. สร้าง lookup sets ──
      const usedRoomSlots = new Set<string>((existing || []).map((r: any) => `${r.day_of_week}-${r.slot_id}`));

      // usedTeacherSlots: รวมทุกคาบ (สอน + ประชุม) ของครูจากทุกห้อง
      const usedTeacherSlots = new Set<string>([
        ...(existing || []).filter((r: any) => r.teacher_id).map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`),
        ...(allRoomsExisting || []).filter((r: any) => r.teacher_id).map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`),
      ]);

      const usedSubjectDays = new Set<string>((existing || []).map((r: any) => `${r.subject_id}-${r.day_of_week}`));

      const usedClassroomSlots = new Set<string>([
        ...(allRoomsExisting || []).map((r: any) => `${r.classroom_id}-${r.day_of_week}-${r.slot_id}`),
        ...(existing || []).map((r: any) => `${r.classroom_id}-${r.day_of_week}-${r.slot_id}`),
      ]);

      // นับ unique คาบสอน (day+slot) ของแต่ละวิชา ไม่นับซ้ำกรณี multi-teacher
      const existingSubjectSlots: Record<string, Set<string>> = {};
      for (const r of (existing || [])) {
        if (!r.activity_type) {
          if (!existingSubjectSlots[r.subject_id]) existingSubjectSlots[r.subject_id] = new Set();
          existingSubjectSlots[r.subject_id].add(`${r.day_of_week}-${r.slot_id}`);
        }
      }
      const existingSubjectCount: Record<string, number> = {};
      for (const [subId, slots] of Object.entries(existingSubjectSlots)) {
        existingSubjectCount[subId] = slots.size;
      }

      // ── 6. นับคาบสอนต่อ (ครู, วัน) จาก existing ทั้งหมด ──
      const teacherDayCount: Record<string, number> = {};
      for (const r of [...(existing || []), ...(allRoomsExisting || [])]) {
        if (r.teacher_id && !r.activity_type) {
          const key = `${r.teacher_id}-${r.day_of_week}`;
          teacherDayCount[key] = (teacherDayCount[key] || 0) + 1;
        }
      }

      // ── 7. สร้าง jobs ──
      type Job = { subject_id: string; teacher_id: string | null; periods_needed: number; major_group: string; };
      const jobs: Job[] = structures.map((s: any) => ({
        subject_id: s.subject_id,
        teacher_id: s.course_teachers?.[0]?.teacher_id || null,
        periods_needed: Math.max(0, (s.periods_per_week || 1) - (existingSubjectCount[s.subject_id] || 0)),
        major_group: s.major_group || "ทั้งหมด",
      })).filter((j: Job) => j.periods_needed > 0);

      // ── 8. สุ่ม slot ที่ว่าง ──
      const allSlots = days.flatMap(day => realSlotIds.map(slotId => ({ day, slotId })));
      const shuffle = (arr: typeof allSlots) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };
      let availableSlots = shuffle(allSlots.filter(s => !usedRoomSlots.has(`${s.day}-${s.slotId}`)));

      const toInsert: any[] = [];
      const failLog: { subject_id: string; reasons: Record<string, number> }[] = [];

      // helper: นับคาบสอนของครูในวันนั้น รวม toInsert ที่กำลังจัด
      const countTeacherOnDay = (tid: string, day: string): number => {
        const fromExisting = teacherDayCount[`${tid}-${day}`] || 0;
        const fromNew = toInsert.filter(r => String(r.teacher_id) === String(tid) && r.day_of_week === day).length;
        return fromExisting + fromNew;
      };

      // ── 9. วน loop จัด slot ──
      for (const job of jobs) {
        let placed = 0;
        const newAvailable: typeof availableSlots = [];
        const reasons: Record<string, number> = {
          teacherBusy: 0, subjectSameDay: 0, mathRule: 0, classroomConflict: 0, exceedsDaily: 0
        };

        for (const slot of availableSlots) {
          if (placed >= job.periods_needed) { newAvailable.push(slot); continue; }

          const teacherBusy = job.teacher_id
            ? usedTeacherSlots.has(`${job.teacher_id}-${slot.day}-${slot.slotId}`)
            : false;
          const subjectSameDay = usedSubjectDays.has(`${job.subject_id}-${slot.day}`);
          const jobSubjectName = subjects.find(s => s.id === job.subject_id)?.name || "";
          const existingSlotsInDay = [
            ...(existing || []).map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => s.id === r.subject_id)?.name || "" })),
            ...toInsert.filter((r: any) => r.day_of_week === slot.day).map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => s.id === r.subject_id)?.name || "" })),
          ].filter(r => r.slot_id !== slot.slotId);
          const violatesMathRule = wouldViolateMathAdjacentRule(jobSubjectName, slot.slotId, existingSlotsInDay);
          const classroomConflict = usedClassroomSlots.has(`${selectedRoom}-${slot.day}-${slot.slotId}`);

          // ✅ ตรวจ max คาบ/วัน ของครู (อิงจาก course_structures)
          const maxPerDay = job.teacher_id ? (teacherMaxPerDay[String(job.teacher_id)] ?? 4) : 99;
          const exceedsDaily = job.teacher_id
            ? countTeacherOnDay(String(job.teacher_id), slot.day) >= maxPerDay
            : false;

          if (!teacherBusy && !subjectSameDay && !violatesMathRule && !classroomConflict && !exceedsDaily) {
            toInsert.push({
              classroom_id: selectedRoom, subject_id: job.subject_id, teacher_id: job.teacher_id,
              day_of_week: slot.day, slot_id: slot.slotId, is_locked: false,
              major_group: job.major_group, academic_year: termInfo.year, semester: termInfo.semester
            });
            usedRoomSlots.add(`${slot.day}-${slot.slotId}`);
            usedSubjectDays.add(`${job.subject_id}-${slot.day}`);
            usedClassroomSlots.add(`${selectedRoom}-${slot.day}-${slot.slotId}`);
            if (job.teacher_id) usedTeacherSlots.add(`${job.teacher_id}-${slot.day}-${slot.slotId}`);
            placed++;
          } else {
            if (teacherBusy)        reasons.teacherBusy++;
            if (subjectSameDay)     reasons.subjectSameDay++;
            if (violatesMathRule)   reasons.mathRule++;
            if (classroomConflict)  reasons.classroomConflict++;
            if (exceedsDaily)       reasons.exceedsDaily++;
            newAvailable.push(slot);
          }
        }
        if (placed < job.periods_needed) failLog.push({ subject_id: job.subject_id, reasons });
        availableSlots = newAvailable;
      }

      // ── 10. Insert ──
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from("teaching_assignments").insert(toInsert);
        if (insertErr) throw insertErr;
      }

      // ── 11. แจ้งถ้าจัดไม่ครบ ──
      if (failLog.length > 0) {
        const lines = failLog.map(f => {
          const subName = subjects.find(s => s.id === f.subject_id)?.name || f.subject_id;
          const subCode = subjects.find(s => s.id === f.subject_id)?.code || "";
          const r = f.reasons; const why: string[] = [];
          const tid = jobs.find(j => j.subject_id === f.subject_id)?.teacher_id;
          if (r.teacherBusy > 0)       why.push(`ครูติดคาบอื่น ${r.teacherBusy} คาบ`);
          if (r.subjectSameDay > 0)    why.push(`วิชาซ้ำวัน ${r.subjectSameDay} คาบ`);
          if (r.mathRule > 0)          why.push(`กฎคณิตติดกัน ${r.mathRule} คาบ`);
          if (r.classroomConflict > 0) why.push(`ห้องมีครูอื่นสอนแล้ว ${r.classroomConflict} คาบ`);
          if (r.exceedsDaily > 0)      why.push(`ครูสอนเกิน ${tid ? (teacherMaxPerDay[String(tid)] ?? 4) : 4} คาบ/วัน (${r.exceedsDaily} slot ถูกข้าม)`);
          return `• ${subCode} ${subName}: ${why.join(", ") || "ไม่มีช่วงว่างพอ"}`;
        });
        alert(`⚠️ จัดตารางไม่ครบ ${failLog.length} วิชา:\n\n${lines.join("\n")}`);
      }
    } catch (err: any) { console.error(err); alert("เกิดข้อผิดพลาด: " + err.message); }
    finally { setIsLoading(false); await fetchSchedule(); }
  }

  async function handleSaveGlobalSubject() {
    const isFreeMode = fixedFormData.subject_id === '__free__';
    if (!isFreeMode && !fixedFormData.subject_id) return;
    let targetRooms = classrooms;
    if (fixedFormData.target_level !== 'all') {
      targetRooms = classrooms.filter(r => r.name.trim().startsWith(fixedFormData.target_level) || r.name.trim().startsWith("ม." + fixedFormData.target_level));
    }
    if (targetRooms.length === 0) return;
    setIsLoading(true);
    try {
      const targetRoomIds = targetRooms.map(r => r.id);
      await supabase.from("teaching_assignments").delete()
        .eq("academic_year", termInfo.year).eq("semester", termInfo.semester)
        .eq("day_of_week", fixedFormData.day_of_week).eq("slot_id", fixedFormData.slot_id)
        .in("classroom_id", targetRoomIds);
      if (!isFreeMode) {
        const insertPayload = targetRooms.map(room => ({ classroom_id: room.id, subject_id: fixedFormData.subject_id, teacher_id: fixedFormData.teacher_id || null, day_of_week: fixedFormData.day_of_week, slot_id: fixedFormData.slot_id, is_locked: true, major_group: fixedFormData.major_group || "ทั้งหมด", academic_year: termInfo.year, semester: termInfo.semester }));
        const { error } = await supabase.from("teaching_assignments").insert(insertPayload);
        if (error) throw error;
      }
      setIsFixedModalOpen(false);
      await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
    } catch (err: any) { console.error(err); }
    finally { setIsLoading(false); }
  }

  async function handleDelete(id: number) {
    await supabase.from("teaching_assignments").delete().eq("id", id);
    await fetchSchedule();
  }

  async function clearSchedule(mode: "unlocked" | "all") {
    setIsLoading(true);
    let query = supabase.from("teaching_assignments").delete()
      .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester);
    if (mode === "unlocked") query = query.eq("is_locked", false);
    await query;
    setShowClearModal(false);
    await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
    setIsLoading(false);
  }

  // helper: ชื่อห้องสำหรับ title (ป้องกัน undefined)
  const selectedRoomName = classrooms.find(c => String(c.id) === String(selectedRoom))?.name ?? selectedRoom;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📅 จัดตารางสอน</h1>
            <p className="text-slate-500 text-sm">ปีการศึกษา {termInfo.year} เทอม {termInfo.semester}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/print/timetable" target="_blank" className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-bold flex items-center gap-2 shadow-sm">🖨️ พิมพ์ตารางสอน (PDF)</Link>
            <Link href="/" className="px-4 py-2 bg-white border rounded-lg hover:bg-slate-50 text-sm font-bold shadow-sm">🏠 กลับหน้าหลัก</Link>
          </div>
        </div>

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
            <button onClick={() => setIsFixedModalOpen(true)} className="flex-1 md:flex-none px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition shadow-sm flex items-center gap-2">⚙️ ลงวิชาส่วนกลาง</button>
            <button onClick={handleAutoAssign} disabled={!selectedRoom} className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition shadow-sm disabled:opacity-50">🤖 จัดอัตโนมัติ</button>
            <button onClick={() => { setClearMode("unlocked"); setShowClearModal(true); }} disabled={!selectedRoom} className="flex-1 md:flex-none px-4 py-2 border border-red-200 text-red-600 rounded-lg font-bold text-sm hover:bg-red-50 transition disabled:opacity-50">🗑️ ล้างตาราง</button>
          </div>
        </div>

        {selectedRoom ? (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full border-collapse table-fixed">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-2 border-r font-bold sticky left-0 bg-slate-50 z-10 text-slate-500 text-xs" style={{ width: '5%' }}>วัน</th>
                    {timeSlots.map(s => (
                      <th key={s.id} className="border-r last:border-0 text-center py-1 px-0.5" style={{ width: s.isBreak ? '2%' : '9%' }}>
                        {s.isBreak ? <div className="text-[8px] text-slate-400 leading-tight">{s.label}</div> : (
                          <><div className="text-[10px] font-bold text-indigo-900">{s.label}</div><div className="text-[8px] text-slate-400 font-normal leading-tight">{s.time}</div></>
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
                        if (slot.isBreak) return <td key={slot.id} className="bg-slate-100/50 border-r" />;
                        const matches = scheduleData.filter(a => a.day_of_week === day && a.slot_id === Number(slot.id));

                        // Group rows ที่เป็นวิชาเดียวกันในคาบเดียวกัน → card เดียว แสดงครูทุกคน
                        const grouped: { primary: ScheduleItem; teachers: string[] }[] = [];
                        for (const m of matches) {
                          const existing = grouped.find(g => g.primary.subject_id === m.subject_id);
                          if (existing) {
                            if (m.teachers?.full_name) existing.teachers.push(m.teachers.full_name);
                          } else {
                            grouped.push({ primary: m, teachers: m.teachers?.full_name ? [m.teachers.full_name] : [] });
                          }
                        }

                        return (
                          <td key={slot.id} className="border-r p-0.5 align-top relative group" style={{ height: '112px' }}
                            onClick={() => {
                              if (grouped.length === 0) {
                                setEditingId(null);
                                setFormData({ subject_id: "", teacher_ids: [""], major_group: "ทั้งหมด", is_locked: true });
                                setSubjectSearch(""); setSubjectDropdownOpen(false);
                                setTeacherSearch(""); setTeacherDropdownOpen(false);
                                setActiveSlot({ day, slotId: Number(slot.id) });
                                setIsModalOpen(true);
                              }
                            }}>
                            {grouped.length === 0 && (
                              <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition">
                                <span className="text-indigo-400 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded-full">+</span>
                              </div>
                            )}
                            {grouped.map(({ primary: m, teachers: teacherNames }) => (
                              <div key={m.id}
                                onClick={(e) => { e.stopPropagation(); handleEditClick(m); }}
                                className={`h-full flex flex-col p-2 rounded-lg border shadow-sm relative mb-0.5 cursor-pointer hover:scale-[1.02] transition-all overflow-hidden
                                  ${m.is_locked ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-300' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                                <button onClick={(e) => { e.stopPropagation(); matches.forEach(x => { if (x.id) handleDelete(x.id); }); }}
                                  className="absolute top-0.5 right-0.5 bg-red-100 text-red-600 rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-200 shadow-sm z-20 text-[10px] leading-none">×</button>
                                <div className="font-bold text-indigo-900 line-clamp-2 text-[11px] leading-snug">{m.subjects?.name}</div>
                                {/* ครูทุกคน */}
                                <div className="mt-0.5 space-y-0.5">
                                  {teacherNames.map((name, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <span className={`w-3 h-3 rounded-full flex-shrink-0 text-[7px] flex items-center justify-center font-bold
                                        ${i === 0 ? 'bg-indigo-200 text-indigo-700' : i === 1 ? 'bg-violet-200 text-violet-700' : 'bg-pink-200 text-pink-700'}`}>
                                        {i + 1}
                                      </span>
                                      <span className="text-slate-400 text-[9px] leading-snug line-clamp-1">{name}</span>
                                    </div>
                                  ))}
                                  {teacherNames.length === 0 && <div className="text-slate-300 text-[9px]">-</div>}
                                </div>
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

            {structureSummary && (
              <div className={`rounded-xl border p-6 mt-4 ${structureSummary.some(i => i.placed < i.needed) ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      {structureSummary.some(i => i.placed < i.needed) ? '⚠️' : '✅'} สรุปสถานะรายวิชา
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      ลงแล้ว <span className="font-bold text-indigo-600">{structureSummary.reduce((s, i) => s + i.placed, 0)}</span> คาบ จากทั้งหมด <span className="font-bold">{structureSummary.reduce((s, i) => s + i.needed, 0)}</span> คาบ
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {structureSummary.filter(i => i.placed < i.needed).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                        ลงไม่ครบ ({structureSummary.filter(i => i.placed < i.needed).length} วิชา)
                      </div>
                      <div className="overflow-hidden rounded-lg border border-red-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-red-100/60 text-red-600 text-xs font-semibold">
                            <tr>
                              {["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "ลงได้", "ขาด"].map(h => (
                                <th key={h} className="px-4 py-2 border-b border-red-200">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100 bg-white">
                            {structureSummary.filter(i => i.placed < i.needed).map((item, idx) => (
                              <tr key={`${item.subject_id}-${idx}`} className="hover:bg-red-50">
                                <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                                <td className="px-4 py-2.5 text-center font-bold text-slate-600">{item.placed}/{item.needed}</td>
                                <td className="px-4 py-2.5 text-center"><span className="inline-block px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-bold text-xs">-{item.needed - item.placed} คาบ</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
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
                              {["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "จำนวนคาบ"].map(h => (
                                <th key={h} className="px-4 py-2 border-b border-green-200">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-100 bg-white">
                            {structureSummary.filter(i => i.placed === i.needed).map((item, idx) => (
                              <tr key={`${item.subject_id}-${idx}`} className="hover:bg-green-50">
                                <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                                <td className="px-4 py-2.5 text-center"><span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-xs">{item.placed} คาบ</span></td>
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

      {/* ── Modal: ลงวิชาปกติ ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border" style={{ overflow: 'visible' }}>
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center rounded-t-2xl">
              <h3 className="font-bold text-slate-800">
                {editingId ? '📝 แก้ไขข้อมูลคาบเรียน' : `ลงวิชาห้อง ${selectedRoomName}`}
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); setSubjectDropdownOpen(false); setSubjectSearch(""); setTeacherDropdownOpen(false); setTeacherSearch(""); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div className="text-xs text-slate-500 font-bold uppercase mb-1">วัน{activeSlot?.day} คาบที่ {activeSlot?.slotId}</div>

              {/* Subject dropdown */}
              <div className="relative">
                <div className="w-full p-2 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                  onClick={() => setSubjectDropdownOpen(prev => !prev)}>
                  <span className={formData.subject_id ? "text-slate-800" : "text-slate-400"}>
                    {formData.subject_id
                      ? (() => { const s = subjects.find(s => s.id === formData.subject_id); return s ? `${s.code} - ${s.name}` : "-- เลือกวิชา --"; })()
                      : "-- เลือกวิชา --"}
                  </span>
                  <span className="text-slate-400 text-xs ml-2">{subjectDropdownOpen ? "▲" : "▼"}</span>
                </div>
                {subjectDropdownOpen && (
                  <div className="absolute z-[60] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b">
                      <input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
                        placeholder="🔍 ค้นหารหัสหรือชื่อวิชา..." value={subjectSearch}
                        onChange={e => setSubjectSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
                        onClick={() => { setFormData({ ...formData, subject_id: "" }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>
                        -- เลือกวิชา --
                      </div>
                      {subjectsForSelectedRoom.filter(s =>
                        subjectSearch === "" || s.code.toLowerCase().includes(subjectSearch.toLowerCase()) || s.name.toLowerCase().includes(subjectSearch.toLowerCase())
                      ).map(s => (
                        <div key={s.id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${formData.subject_id === s.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`}
                          onClick={() => { setFormData({ ...formData, subject_id: s.id }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>
                          <span className="font-mono text-xs text-slate-400 mr-2">{s.code}</span>{s.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Multi-teacher selector ── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase">ครูผู้สอน ({formData.teacher_ids.length}/{MAX_TEACHERS})</span>
                  {formData.teacher_ids.length < MAX_TEACHERS && (
                    <button type="button"
                      onClick={() => setFormData(f => ({ ...f, teacher_ids: [...f.teacher_ids, ""] }))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold px-2 py-0.5 rounded hover:bg-indigo-50 transition">
                      + เพิ่มครู
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {formData.teacher_ids.map((tid, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {/* Badge ลำดับ */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
                        ${idx === 0 ? 'bg-indigo-100 text-indigo-700' : idx === 1 ? 'bg-violet-100 text-violet-700' : 'bg-pink-100 text-pink-700'}`}>
                        {idx + 1}
                      </div>
                      {/* Dropdown */}
                      <div className="relative flex-1">
                        <div className="w-full p-2 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                          onClick={() => { setTeacherDropdownOpen(teacherDropdownOpen === idx ? false : idx); setTeacherSearch(""); }}>
                          <span className={tid ? "text-slate-800" : "text-slate-400"}>
                            {tid ? teachers.find(t => t.id === tid)?.full_name || "-- เลือกครู --" : `-- ครูคนที่ ${idx + 1} --`}
                          </span>
                          <span className="text-slate-400 text-xs ml-2">{teacherDropdownOpen === idx ? "▲" : "▼"}</span>
                        </div>
                        {teacherDropdownOpen === idx && (
                          <div className="absolute z-[60] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                            <div className="p-2 border-b">
                              <input autoFocus
                                className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
                                placeholder="🔍 ค้นหาชื่อครู..."
                                value={teacherSearch}
                                onChange={e => setTeacherSearch(e.target.value)}
                                onClick={e => e.stopPropagation()} />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer border-b"
                                onClick={() => {
                                  setFormData(f => { const ids = [...f.teacher_ids]; ids[idx] = ""; return { ...f, teacher_ids: ids }; });
                                  setTeacherDropdownOpen(false); setTeacherSearch("");
                                }}>
                                -- ไม่ระบุ --
                              </div>
                              {(() => {
                                const filtered = teachers.filter(t =>
                                  (teacherSearch === "" || t.full_name.toLowerCase().includes(teacherSearch.toLowerCase())) &&
                                  !formData.teacher_ids.some((selectedId, i) => i !== idx && selectedId === t.id)
                                );
                                const entries = fuzzyGroupedTeachers
                                  .map(([dept, list]) => [dept, list.filter((t: Teacher) => filtered.find(f => f.id === t.id))] as [string, Teacher[]])
                                  .filter(([, list]) => list.length > 0);
                                if (entries.length === 0) return <div className="px-3 py-3 text-sm text-slate-400 text-center">ไม่พบครู</div>;
                                return entries.map(([dept, list]) => (
                                  <div key={dept}>
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-b border-t sticky top-0">{dept}</div>
                                    {list.map((t: Teacher) => (
                                      <div key={t.id}
                                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${tid === t.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`}
                                        onClick={() => {
                                          setFormData(f => { const ids = [...f.teacher_ids]; ids[idx] = t.id; return { ...f, teacher_ids: ids }; });
                                          setTeacherDropdownOpen(false); setTeacherSearch("");
                                        }}>
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
                      {/* ปุ่มลบ (ไม่ให้ลบช่องแรก) */}
                      {idx > 0 && (
                        <button type="button"
                          onClick={() => setFormData(f => ({ ...f, teacher_ids: f.teacher_ids.filter((_, i) => i !== idx) }))}
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center flex-shrink-0 transition text-xs">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {formData.teacher_ids.length < MAX_TEACHERS ? `กด "+ เพิ่มครู" เพื่อเพิ่มได้อีก ${MAX_TEACHERS - formData.teacher_ids.length} คน` : "ครบ 3 คนแล้ว (สูงสุด)"}
                </p>
              </div>

              <input className="w-full p-2 border rounded-xl bg-slate-50 outline-none" placeholder="กลุ่มเรียน (Option)" value={formData.major_group} onChange={e => setFormData({ ...formData, major_group: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formData.is_locked} onChange={e => setFormData({ ...formData, is_locked: e.target.checked })} /> ล็อกคาบนี้
              </label>

              {/* ลงคาบว่างทั้งสัปดาห์ */}
              <div className="pt-1 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 mb-2 font-semibold uppercase">ลงคาบว่างพร้อมกันทุกวัน</p>
                <button
                  onClick={async () => {
                    if (!activeSlot || !selectedRoom) return;
                    setIsLoading(true);
                    const toInsert = days
                      .filter(d => !scheduleData.some(a => a.day_of_week === d && a.slot_id === activeSlot.slotId))
                      .map(d => ({
                        classroom_id: selectedRoom,
                        subject_id: formData.subject_id || null,
                        teacher_id: formData.teacher_ids[0] || null,
                        day_of_week: d, slot_id: activeSlot.slotId,
                        is_locked: formData.is_locked,
                        major_group: formData.major_group || "ทั้งหมด",
                        academic_year: termInfo.year, semester: termInfo.semester,
                      }));
                    if (toInsert.length > 0) await supabase.from("teaching_assignments").insert(toInsert);
                    setIsModalOpen(false); setEditingId(null);
                    await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
                    setIsLoading(false);
                  }}
                  className="w-full py-2 bg-slate-700 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition">
                  📅 ลงคาบ {activeSlot?.slotId} ทุกวัน (เฉพาะช่องว่าง)
                </button>
              </div>

              <button onClick={handleSave} className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold mt-1">
                {editingId ? 'บันทึกการแก้ไข' : 'เพิ่มคาบเรียน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: ลงวิชาส่วนกลาง ── */}
      {isFixedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border ring-4 ring-amber-100" style={{ overflow: 'visible' }}>
            <div className="p-4 border-b bg-amber-50 flex justify-between items-center rounded-t-2xl">
              <h3 className="font-bold text-amber-900 text-lg">⚙️ กำหนดวิชาส่วนกลาง</h3>
              <button onClick={() => setIsFixedModalOpen(false)} className="text-amber-400 hover:text-amber-600">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">โหมด</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'subject', label: '📚 ลงวิชาเรียน', desc: 'เลือกวิชา+ครู ลงทุกห้องในชั้น' },
                    { value: 'free', label: '🕐 คาบว่าง/กิจกรรม', desc: 'ลงคาบว่างหรือกิจกรรมพร้อมกัน' },
                  ].map(m => (
                    <div key={m.value}
                      onClick={() => setFixedFormData({ ...fixedFormData, subject_id: m.value === 'free' ? '__free__' : (fixedFormData.subject_id === '__free__' ? '' : fixedFormData.subject_id) })}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition ${(m.value === 'free' ? fixedFormData.subject_id === '__free__' : fixedFormData.subject_id !== '__free__') ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-200'}`}>
                      <div className="font-bold text-sm">{m.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">ระดับชั้นเป้าหมาย</label>
                <select className="w-full p-2.5 border rounded-xl bg-slate-50 font-bold text-slate-700 text-sm"
                  value={fixedFormData.target_level}
                  onChange={e => setFixedFormData({ ...fixedFormData, target_level: e.target.value, subject_id: fixedFormData.subject_id === '__free__' ? '__free__' : '' })}>
                  <option value="all">🌍 ทุกระดับชั้น</option>
                  {[1, 2, 3, 4, 5, 6].map(lv => <option key={lv} value={String(lv)}>ม.{lv}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">วัน</label>
                  <select className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm font-bold text-slate-700"
                    value={fixedFormData.day_of_week} onChange={e => setFixedFormData({ ...fixedFormData, day_of_week: e.target.value })}>
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">คาบ</label>
                  <select className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm font-bold text-slate-700"
                    value={fixedFormData.slot_id} onChange={e => setFixedFormData({ ...fixedFormData, slot_id: Number(e.target.value) })}>
                    {timeSlots.filter(s => !s.isBreak).map(s => <option key={s.id} value={Number(s.id)}>คาบ {s.id} ({s.time})</option>)}
                  </select>
                </div>
              </div>
              {fixedFormData.subject_id !== '__free__' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">วิชาเรียน</label>
                  <div className="relative">
                    <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                      onClick={() => setSubjectDropdownOpen(p => !p)}>
                      <span className={fixedFormData.subject_id ? "text-slate-800" : "text-slate-400"}>
                        {fixedFormData.subject_id ? (() => { const s = subjects.find(s => s.id === fixedFormData.subject_id); return s ? `${s.code} - ${s.name}` : "-- เลือกวิชา --"; })() : "-- เลือกวิชา --"}
                      </span>
                      <span className="text-slate-400 text-xs">{subjectDropdownOpen ? "▲" : "▼"}</span>
                    </div>
                    {subjectDropdownOpen && (
                      <div className="absolute z-30 bottom-full mb-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b">
                          <input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-amber-300"
                            placeholder="🔍 ค้นหา..." value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
                            onClick={() => { setFixedFormData({ ...fixedFormData, subject_id: "" }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>-- เลือกวิชา --</div>
                          {subjectsForFixedModal.filter(s => subjectSearch === "" || s.code.toLowerCase().includes(subjectSearch.toLowerCase()) || s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(s => (
                            <div key={s.id}
                              className={`px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 ${fixedFormData.subject_id === s.id ? "bg-amber-50 font-bold text-amber-700" : "text-slate-700"}`}
                              onClick={() => { setFixedFormData({ ...fixedFormData, subject_id: s.id }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>
                              <span className="font-mono text-xs text-slate-400 mr-2">{s.code}</span>{s.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">ครูผู้สอน (ถ้ามี)</label>
                <div className="relative">
                  <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                    onClick={() => setTeacherDropdownOpen(teacherDropdownOpen === 99 ? false : 99)}>
                    <span className={fixedFormData.teacher_id ? "text-slate-800" : "text-slate-400"}>
                      {fixedFormData.teacher_id ? teachers.find(t => t.id === fixedFormData.teacher_id)?.full_name || "-- เลือกครู --" : "-- เลือกครู --"}
                    </span>
                    <span className="text-slate-400 text-xs">{teacherDropdownOpen === 99 ? "▲" : "▼"}</span>
                  </div>
                  {teacherDropdownOpen === 99 && (
                    <div className="absolute z-30 bottom-full mb-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b">
                        <input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-amber-300"
                          placeholder="🔍 ค้นหาชื่อครู..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer border-b"
                          onClick={() => { setFixedFormData({ ...fixedFormData, teacher_id: "" }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}>-- ไม่ระบุครู --</div>
                        {(() => {
                          const filtered = teachers.filter(t => teacherSearch === "" || t.full_name.toLowerCase().includes(teacherSearch.toLowerCase()));
                          const entries = fuzzyGroupedTeachers.map(([dept, list]) => [dept, list.filter((t: Teacher) => filtered.find(f => f.id === t.id))] as [string, Teacher[]]).filter(([, list]) => list.length > 0);
                          return entries.map(([dept, list]) => (
                            <div key={dept}>
                              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-y sticky top-0">{dept}</div>
                              {list.map((t: Teacher) => (
                                <div key={t.id}
                                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 ${fixedFormData.teacher_id === t.id ? "bg-amber-50 font-bold text-amber-700" : "text-slate-700"}`}
                                  onClick={() => { setFixedFormData({ ...fixedFormData, teacher_id: t.id }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}>
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
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">กลุ่มเรียน / หมายเหตุ</label>
                <input className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm outline-none"
                  placeholder="เช่น กิจกรรม, ชุมนุม, HR..."
                  value={fixedFormData.major_group} onChange={e => setFixedFormData({ ...fixedFormData, major_group: e.target.value })} />
              </div>
              {(() => {
                const targetRooms = fixedFormData.target_level === 'all' ? classrooms : classrooms.filter(r => r.name.trim().startsWith(fixedFormData.target_level) || r.name.trim().startsWith("ม." + fixedFormData.target_level));
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                    <div className="font-bold text-amber-800">📋 สรุปการดำเนินการ</div>
                    <div className="text-amber-700 mt-1 space-y-0.5 text-xs">
                      <div>• ห้องเป้าหมาย: <span className="font-bold">{targetRooms.length} ห้อง</span></div>
                      <div>• วัน/คาบ: <span className="font-bold">วัน{fixedFormData.day_of_week} คาบ {fixedFormData.slot_id}</span></div>
                      <div>• ข้อมูลเดิมในช่องนั้นจะถูก<span className="font-bold text-red-500">ลบและแทนที่</span></div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button onClick={() => setIsFixedModalOpen(false)} className="flex-1 py-2.5 font-bold text-slate-400 text-sm rounded-xl hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleSaveGlobalSubject} disabled={isLoading || (fixedFormData.subject_id !== '__free__' && !fixedFormData.subject_id)}
                className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-bold shadow-lg hover:bg-amber-600 disabled:opacity-40 text-sm">
                {isLoading ? "กำลังประมวลผล..." : "✅ ยืนยันลงวิชา"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: ยืนยันล้างตาราง ── */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border p-6 space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-2">🗑️</div>
              <h3 className="text-lg font-bold text-slate-800">ล้างตารางสอน</h3>
              <p className="text-sm text-slate-500 mt-1">ห้อง {selectedRoomName}</p>
            </div>
            <div className="space-y-3">
              {[
                { value: "unlocked", icon: "🔓", label: "ล้างเฉพาะที่ไม่ได้ล็อก", desc: "วิชาที่ล็อก 🔒 จะยังคงอยู่", color: "amber" },
                { value: "all", icon: "💣", label: "ล้างทั้งหมด", desc: "รวมวิชาที่ล็อกไว้ด้วย", color: "red" },
              ].map(m => (
                <div key={m.value} onClick={() => setClearMode(m.value as any)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition ${clearMode === m.value ? `border-${m.color}-400 bg-${m.color}-50` : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.icon}</span>
                    <div>
                      <div className={`font-bold text-sm ${m.value === 'all' ? 'text-red-700' : 'text-slate-800'}`}>{m.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowClearModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => clearSchedule(clearMode)}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition ${clearMode === "all" ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                {clearMode === "all" ? "💣 ล้างทั้งหมด" : "🔓 ล้างที่ไม่ล็อก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed bottom-5 right-5 bg-white p-3 rounded-xl shadow-2xl border flex items-center gap-2 z-[100]">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase">Processing...</span>
        </div>
      )}
    </div>
  );
}