"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient'
import Link from "next/link";

function strSimilarity(a: string, b: string): number {
  a = a.trim().toLowerCase(); b = b.trim().toLowerCase();
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

const ADJACENT_SLOT_PAIRS: [number, number][] = [[1,2],[3,4],[5,6],[6,7]];
function areSlotsAdjacent(a: number, b: number) {
  return ADJACENT_SLOT_PAIRS.some(([x,y]) => (x===a&&y===b)||(x===b&&y===a));
}
function isMathSubject(name: string) { return name.includes("คณิต"); }
function wouldViolateMathAdjacentRule(newName: string, newSlot: number, existing: {slot_id:number;subjectName:string}[]) {
  if (!isMathSubject(newName)) return false;
  return existing.some(e => isMathSubject(e.subjectName) && areSlotsAdjacent(newSlot, e.slot_id));
}

// กฎ A: วิชาที่มี > 2 คาบ ห้ามลงวันติดกัน (SOFT)
const DAY_ORDER: Record<string, number> = { "จันทร์": 0, "อังคาร": 1, "พุธ": 2, "พฤหัสบดี": 3, "ศุกร์": 4 };
function areAdjacentDays(dayA: string, dayB: string): boolean {
  return Math.abs((DAY_ORDER[dayA] ?? -99) - (DAY_ORDER[dayB] ?? -99)) === 1;
}
function wouldViolateSpreadRule(periodsNeeded: number, newDay: string, usedDays: string[]): boolean {
  if (periodsNeeded <= 2) return false;
  return usedDays.some(d => areAdjacentDays(d, newDay));
}

function getLevelPrefixFromRoomName(roomName: string): string | null {
  const n = roomName.trim();
  if (/^6|^ม\.?\s*6/.test(n)) return "33";
  if (/^5|^ม\.?\s*5/.test(n)) return "32";
  if (/^4|^ม\.?\s*4/.test(n)) return "31";
  if (/^3|^ม\.?\s*3/.test(n)) return "23";
  if (/^2|^ม\.?\s*2/.test(n)) return "22";
  if (/^1|^ม\.?\s*1/.test(n)) return "21";
  return null;
}
function getLevelPrefixFromTargetLevel(level: string): string | null {
  return ({"6":"33","5":"32","4":"31","3":"23","2":"22","1":"21"} as Record<string,string>)[level] ?? null;
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

const TEACHER_BADGE_COLORS = [
  { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-200 text-indigo-700' },
  { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-200 text-violet-700' },
  { badge: 'bg-pink-100 text-pink-700',     dot: 'bg-pink-200 text-pink-700' },
  { badge: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-200 text-teal-700' },
];

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

const MAX_TEACHERS = 4;

export default function ManageAssignments() {
  const [selectedRoom, setSelectedRoom] = useState("");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ day: string; slotId: number } | null>(null);
  const [termInfo, setTermInfo] = useState({ year: "2569", semester: "3" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState<number | false>(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<"unlocked" | "all">("unlocked");
  const [clearScope, setClearScope] = useState<"room" | "all">("room");
  const [slotStatus, setSlotStatus] = useState<Record<string, "safe" | "warn" | "conflict">>({});
  const [allRoomAssignments, setAllRoomAssignments] = useState<any[]>([]);
  const [courseStructures, setCourseStructures] = useState<any[]>([]);
  const [formData, setFormData] = useState({ subject_id: "", teacher_ids: [""] as string[], major_group: "ทั้งหมด", is_locked: true });
  const [fixedFormData, setFixedFormData] = useState({ subject_id: "", day_of_week: "จันทร์", slot_id: 1, teacher_id: "", major_group: "กิจกรรม", target_level: "all", delete_old: true });

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
  const realSlotIds = timeSlots.filter(s => !s.isBreak).map(s => Number(s.id));

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

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { if (selectedRoom) fetchSchedule(); }, [selectedRoom, termInfo]);
  useEffect(() => {
    if (!selectedRoom) return;
    const channel = supabase
      .channel(`timetable-room-${selectedRoom}-${termInfo.year}-${termInfo.semester}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teaching_assignments', filter: `classroom_id=eq.${selectedRoom}` }, () => fetchSchedule())
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
        supabase.from("teachers").select("id, full_name, department").order('full_name'),
      ]);
      if (rooms.data) setClassrooms([...rooms.data].sort((a, b) => naturalSort(a.name, b.name)));
      if (subs.data) setSubjects(subs.data);
      if (tchs.data) setTeachers(tchs.data);
    } finally { setIsLoading(false); }
  }

  async function fetchSchedule(roomId?: string, year?: string, semester?: string) {
    const room = roomId ?? selectedRoom;
    const yr = year ?? termInfo.year;
    const sem = semester ?? termInfo.semester;
    if (!room) return;
    setIsLoading(true);
    try {
      const [assignRes, structRes, allRoomsRes] = await Promise.all([
        supabase.from("teaching_assignments").select(`*, subjects(code, name), teachers(full_name, department)`).eq("classroom_id", room).eq("academic_year", yr).eq("semester", sem),
        supabase.from("course_structures").select(`*, course_teachers(teacher_id)`).eq("classroom_id", room).eq("academic_year", yr),
        supabase.from("teaching_assignments").select("teacher_id, classroom_id, day_of_week, slot_id, subject_id, activity_type").eq("academic_year", yr).eq("semester", sem),
      ]);
      if (assignRes.data) setScheduleData(assignRes.data as ScheduleItem[]);
      if (structRes.data) setCourseStructures(structRes.data);
      if (allRoomsRes.data) setAllRoomAssignments(allRoomsRes.data);
    } finally { setIsLoading(false); }
  }

  const handleEditClick = (item: ScheduleItem) => {
    setEditingId(item.id || null);
    setActiveSlot({ day: item.day_of_week, slotId: item.slot_id });
    const teachersInSlot = scheduleData
      .filter(a => a.day_of_week === item.day_of_week && a.slot_id === item.slot_id && a.subject_id === item.subject_id)
      .map(a => a.teacher_id || "").filter(Boolean);
    setFormData({ subject_id: item.subject_id, teacher_ids: teachersInSlot.length > 0 ? teachersInSlot : [""], major_group: item.major_group || "ทั้งหมด", is_locked: item.is_locked || false });
    setSubjectSearch(""); setSubjectDropdownOpen(false);
    setTeacherSearch(""); setTeacherDropdownOpen(false);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen || !formData.subject_id) { setSlotStatus({}); return; }
    const subjectName = subjects.find(s => s.id === formData.subject_id)?.name || "";
    const teacherIds = formData.teacher_ids.filter(Boolean);
    const status: Record<string, "safe" | "warn" | "conflict"> = {};
    for (const day of days) {
      for (const slotId of realSlotIds) {
        const key = `${day}-${slotId}`;
        if (editingId && activeSlot?.day === day && activeSlot?.slotId === slotId) continue;
        const roomAssigns = scheduleData.filter(a => a.day_of_week === day && a.slot_id === slotId && (editingId ? a.id !== editingId : true));
        if (roomAssigns.length > 0) { status[key] = "conflict"; continue; }
        const teacherBusy = teacherIds.some(tid => allRoomAssignments.some(r => String(r.teacher_id) === String(tid) && r.day_of_week === day && r.slot_id === slotId && String(r.classroom_id) !== String(selectedRoom)));
        if (teacherBusy) { status[key] = "conflict"; continue; }
        const subjectSameDay = scheduleData.some(a => a.day_of_week === day && String(a.subject_id) === String(formData.subject_id) && (editingId ? a.id !== editingId : true));
        const slotsInDay = scheduleData.filter(a => a.day_of_week === day && (editingId ? a.id !== editingId : true)).map(a => ({ slot_id: a.slot_id, subjectName: a.subjects?.name || "" }));
        const mathViolation = wouldViolateMathAdjacentRule(subjectName, slotId, slotsInDay);
        if (subjectSameDay || mathViolation) { status[key] = "warn"; continue; }
        status[key] = "safe";
      }
    }
    setSlotStatus(status);
  }, [isModalOpen, formData.subject_id, formData.teacher_ids, scheduleData, allRoomAssignments, editingId]);

  async function handleSave() {
    if (!formData.subject_id || !activeSlot) return;
    const newSubjectName = subjects.find(s => s.id === formData.subject_id)?.name || "";
    if (isMathSubject(newSubjectName)) {
      const slotsInDay = scheduleData.filter(a => a.day_of_week === activeSlot.day && a.id !== editingId).map(a => ({ slot_id: a.slot_id, subjectName: a.subjects?.name || "" }));
      if (wouldViolateMathAdjacentRule(newSubjectName, activeSlot.slotId, slotsInDay)) {
        if (!confirm(`⚠️ คำเตือน: "${newSubjectName}" จะอยู่ติดกับวิชากลุ่มคณิตอีกวิชา\nต้องการลงต่อไปหรือไม่?`)) return;
      }
    }
    const isSlotChanging = !editingId || scheduleData.find(a => a.id === editingId)?.slot_id !== activeSlot.slotId || scheduleData.find(a => a.id === editingId)?.day_of_week !== activeSlot.day;
    if (isSlotChanging) {
      const { data: slotAssigns } = await supabase.from("teaching_assignments").select("teacher_id, classroom_id, activity_type, is_locked, subject_id").eq("academic_year", termInfo.year).eq("semester", termInfo.semester).eq("day_of_week", activeSlot.day).eq("slot_id", activeSlot.slotId).neq("id", editingId ?? -1);
      const lockedInRoom = (slotAssigns || []).filter(a => String(a.classroom_id) === String(selectedRoom) && a.is_locked);
      if (lockedInRoom.length > 0) {
        const lockedSubject = subjects.find(s => String(s.id) === String(lockedInRoom[0].subject_id));
        alert(`🔒 ไม่สามารถลงคาบนี้ได้\n\nช่องนี้มีวิชา "${lockedSubject?.name || "ที่ล็อกแล้ว"}" ล็อกอยู่\nต้องปลดล็อกก่อนจึงจะแก้ไขได้`); return;
      }
      const warnings: string[] = [];
      const validTeacherIds = formData.teacher_ids.filter(id => id !== "");
      for (const tid of validTeacherIds) {
        const conflict = (slotAssigns || []).find(a => String(a.teacher_id) === String(tid));
        if (conflict) {
          const tName = teachers.find(t => t.id === tid)?.full_name || "ครูคนนี้";
          if (conflict.is_locked) { alert(`🔒 ไม่สามารถลงคาบนี้ได้\n\n"${tName}" มีคาบที่ล็อกแล้วในเวลานี้อยู่ที่ห้องอื่น`); return; }
          warnings.push(`👤 "${tName}" มีคาบสอนในเวลานี้อยู่แล้ว`);
        }
      }
      if ((slotAssigns || []).some(a => String(a.classroom_id) === String(selectedRoom))) {
        warnings.push(`🏫 ห้อง "${classrooms.find(r => r.id === selectedRoom)?.name || "ห้องนี้"}" มีวิชาสอนในคาบนี้อยู่แล้ว`);
      }
      if (warnings.length > 0 && !confirm(`⚠️ พบปัญหา ${warnings.length} รายการ:\n\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n\nต้องการลงต่อไปหรือไม่?`)) return;
    }
    setIsLoading(true);
    const validTeacherIds = formData.teacher_ids.filter(id => id !== "");
    const basePayload = { classroom_id: selectedRoom, subject_id: formData.subject_id, teacher_id: validTeacherIds[0] || null, day_of_week: activeSlot.day, slot_id: activeSlot.slotId, is_locked: formData.is_locked, major_group: formData.major_group, academic_year: termInfo.year, semester: termInfo.semester };
    let error;
    if (editingId) {
      await supabase.from("teaching_assignments").delete().eq("classroom_id", selectedRoom).eq("day_of_week", activeSlot.day).eq("slot_id", activeSlot.slotId).eq("subject_id", formData.subject_id).eq("academic_year", termInfo.year).eq("semester", termInfo.semester).eq("is_locked", false).neq("id", editingId);
      const { error: e } = await supabase.from("teaching_assignments").update(basePayload).eq("id", editingId);
      error = e;
      if (!error && validTeacherIds.length > 1) { const { error: e2 } = await supabase.from("teaching_assignments").insert(validTeacherIds.slice(1).map(tid => ({ ...basePayload, teacher_id: tid }))); error = e2; }
    } else {
      const { error: e } = await supabase.from("teaching_assignments").insert([basePayload]);
      error = e;
      if (!error && validTeacherIds.length > 1) { const { error: e2 } = await supabase.from("teaching_assignments").insert(validTeacherIds.slice(1).map(tid => ({ ...basePayload, teacher_id: tid }))); error = e2; }
    }
    if (!error) { setIsModalOpen(false); setEditingId(null); await fetchSchedule(); }
    else alert("เกิดข้อผิดพลาด: " + error.message);
    setIsLoading(false);
  }

  const structureSummary = courseStructures.length > 0
    ? courseStructures.map((s: any) => {
        const subjectInfo = subjects.find(sub => String(sub.id) === String(s.subject_id));
        const teacherId = s.course_teachers?.[0]?.teacher_id || null;
        const teacherInfo = teachers.find(t => String(t.id) === String(teacherId));
        const needed = s.periods_per_week || 1;
        const uniqueSlots = new Set(scheduleData.filter(a => String(a.subject_id) === String(s.subject_id) && String(a.classroom_id) === String(selectedRoom)).map(a => `${a.day_of_week}-${a.slot_id}`));
        const rawPlaced = uniqueSlots.size;
        return { subject_id: s.subject_id, subject_code: subjectInfo?.code || "-", subject_name: subjectInfo?.name || String(s.subject_id), teacher_name: teacherInfo?.full_name || "-", needed, placed: Math.min(rawPlaced, needed), rawPlaced };
      }).sort((a: any, b: any) => a.subject_code.localeCompare(b.subject_code))
    : null;

  // ─── shuffle helper (shared) ───────────────────────────────────────────────
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ─── spreadSlots helper ────────────────────────────────────────────────────
  function spreadSlots(arr: {day:string;slotId:number}[]) {
    const byDay: Record<string, typeof arr> = {};
    for (const s of arr) { if (!byDay[s.day]) byDay[s.day] = []; byDay[s.day].push(s); }
    const shuffledDays = shuffle(days.filter(d => byDay[d]?.length > 0));
    for (const d of shuffledDays) byDay[d] = shuffle(byDay[d]);
    const result: typeof arr = [];
    const maxLen = Math.max(0, ...shuffledDays.map(d => byDay[d].length));
    for (let i = 0; i < maxLen; i++) for (const d of shuffledDays) if (byDay[d][i]) result.push(byDay[d][i]);
    return result;
  }

  async function handleAutoAssign() {
    if (!selectedRoom) return alert("กรุณาเลือกห้องเรียนก่อน");
    const mode = confirm(`ต้องการ "ล้างตารางเดิมทั้งหมด" ก่อนจัดใหม่หรือไม่?\n\n[OK] = ล้างแล้วจัดใหม่\n[Cancel] = เติมเฉพาะช่องว่าง`) ? 'reset' : 'fill';
    setIsLoading(true);
    try {
      const { data: structures, error: structError } = await supabase.from("course_structures").select(`*, course_teachers(teacher_id)`).eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year);
      if (structError || !structures?.length) { alert("⚠️ ไม่พบข้อมูลโครงสร้างรายวิชาของห้องนี้"); return; }

      if (mode === 'reset') {
        await supabase.from("teaching_assignments").delete().eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester).eq("is_locked", false);
      }

      const [existingRes, allRoomsRes] = await Promise.all([
        supabase.from("teaching_assignments").select("day_of_week, slot_id, teacher_id, subject_id, activity_type, is_locked").eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester),
        supabase.from("teaching_assignments").select("day_of_week, slot_id, teacher_id, classroom_id, activity_type").eq("academic_year", termInfo.year).eq("semester", termInfo.semester),
      ]);
      const existing = existingRes.data || [];
      const allRoomsExisting = allRoomsRes.data || [];

      // ── ตรวจสอบ locked ที่ผิดกฎก่อนจัด ──
      const lockedOnly = existing.filter((r: any) => r.is_locked && !r.activity_type);
      const lockedWarnings: string[] = [];

      // 1. วิชาซ้ำวัน (locked)
      const lockedDayCount: Record<string, string[]> = {};
      for (const r of lockedOnly) {
        const key = `${String(r.subject_id)}-${r.day_of_week}`;
        if (!lockedDayCount[key]) lockedDayCount[key] = [];
        lockedDayCount[key].push(`คาบ ${r.slot_id}`);
      }
      for (const [key, slots] of Object.entries(lockedDayCount)) {
        if (slots.length > 1) {
          const [sid, day] = key.split("-");
          const subName = subjects.find(s => String(s.id) === sid)?.name || sid;
          lockedWarnings.push(`📅 "${subName}" ซ้ำวัน${day}: ${slots.join(", ")}`);
        }
      }

      // 2. คณิตติดกัน (locked)
      const lockedByDay: Record<string, { slot_id: number; subject_id: string }[]> = {};
      for (const r of lockedOnly) {
        if (!lockedByDay[r.day_of_week]) lockedByDay[r.day_of_week] = [];
        lockedByDay[r.day_of_week].push({ slot_id: r.slot_id, subject_id: String(r.subject_id) });
      }
      for (const [day, slots] of Object.entries(lockedByDay)) {
        for (const s of slots) {
          const subName = subjects.find(sub => String(sub.id) === s.subject_id)?.name || "";
          if (!isMathSubject(subName)) continue;
          const others = slots.filter(o => o.slot_id !== s.slot_id).map(o => ({ slot_id: o.slot_id, subjectName: subjects.find(sub => String(sub.id) === o.subject_id)?.name || "" }));
          if (wouldViolateMathAdjacentRule(subName, s.slot_id, others)) {
            lockedWarnings.push(`🔢 "${subName}" ติดกับคณิตอีกวิชาในวัน${day} คาบ ${s.slot_id}`);
          }
        }
      }

      if (lockedWarnings.length > 0) {
        const uniqueWarnings = [...new Set(lockedWarnings)];
        alert(`🔒 พบปัญหาในคาบที่ล็อกไว้ก่อนจัดอัตโนมัติ:\n\n${uniqueWarnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n\n⚠️ กรุณาแก้คาบที่ล็อกให้ถูกต้องก่อนกดจัดอัตโนมัติ`);
        return;
      }

      const usedRoomSlots = new Set<string>(existing.map((r: any) => `${r.day_of_week}-${r.slot_id}`));
      const usedTeacherSlots = new Set<string>(allRoomsExisting.filter((r: any) => r.teacher_id).map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`));
      const lockedSubjectDays = new Set<string>(existing.filter((r: any) => r.is_locked && !r.activity_type).map((r: any) => `${String(r.subject_id)}-${r.day_of_week}`));

      const existingSubjectSlots: Record<string, Set<string>> = {};
      for (const r of existing) {
        if (!(r as any).activity_type) {
          const k = String((r as any).subject_id);
          if (!existingSubjectSlots[k]) existingSubjectSlots[k] = new Set();
          existingSubjectSlots[k].add(`${(r as any).day_of_week}-${(r as any).slot_id}`);
        }
      }

      type Job = { subject_id: string; teacher_id: string | null; periods_needed: number; major_group: string; };
      // dedup subject_id: ถ้ามีหลาย row ต่อวิชา (major_group ต่างกัน) ให้นับ periods_per_week สูงสุดของ subject นั้น
      const structuresBySubject: Record<string, any> = {};
      for (const s of structures) {
        const k = String(s.subject_id);
        if (!structuresBySubject[k] || (s.periods_per_week || 1) > (structuresBySubject[k].periods_per_week || 1))
          structuresBySubject[k] = s;
      }
      const jobsTemplate: Job[] = Object.values(structuresBySubject).map((s: any) => ({
        subject_id: String(s.subject_id),
        teacher_id: s.course_teachers?.[0]?.teacher_id || null,
        periods_needed: Math.max(0, (s.periods_per_week || 1) - (existingSubjectSlots[String(s.subject_id)]?.size || 0)),
        major_group: s.major_group || "ทั้งหมด",
      })).filter((j: Job) => j.periods_needed > 0);

      const teacherBusyCount: Record<string, number> = {};
      for (const key of usedTeacherSlots) { const tid = key.split("-")[0]; teacherBusyCount[tid] = (teacherBusyCount[tid] || 0) + 1; }
      jobsTemplate.sort((a, b) => {
        const aB = a.teacher_id ? (teacherBusyCount[String(a.teacher_id)] || 0) : 0;
        const bB = b.teacher_id ? (teacherBusyCount[String(b.teacher_id)] || 0) : 0;
        return bB - aB || b.periods_needed - a.periods_needed;
      });

      const allSlotsBase = days.flatMap(d => realSlotIds.map(slotId => ({ day: d, slotId })));
      const initialSubjectDays = new Set<string>(existing.filter((r: any) => !r.activity_type).map((r: any) => `${String(r.subject_id)}-${r.day_of_week}`));

      // ── retry loop: shuffle แล้วลองใหม่จนครบหรือหมดเวลา ──
      const TIMEOUT_MS = 10_000;
      const startTime = Date.now();
      let bestResult: any[] = [];
      let bestFailed: { subject_id: string; reason: string }[] = jobsTemplate.map(j => ({ subject_id: j.subject_id, reason: "ยังไม่ได้ลอง" }));
      let attempt = 0;

      while (Date.now() - startTime < TIMEOUT_MS) {
        attempt++;
        const jobs: Job[] = jobsTemplate.map(j => ({ ...j })); // clone ทุกรอบ
        const curUsedRoomSlots = new Set(usedRoomSlots);
        const curUsedTeacherSlots = new Set(usedTeacherSlots);
        const curUsedSubjectDays = new Set(initialSubjectDays);
        const toInsert: any[] = [];
        const failedJobs: { subject_id: string; reason: string }[] = [];

        for (const job of jobs) {
          let placedCount = 0;
          const sid = job.subject_id;
          const jobSubjectName = subjects.find(s => String(s.id) === sid)?.name || "";

          for (const allowSameDay of [false, true]) {
            if (placedCount >= job.periods_needed) break;
            const freeSlots = spreadSlots(allSlotsBase.filter(s => !curUsedRoomSlots.has(`${s.day}-${s.slotId}`)));
            const slotsToTry = allowSameDay
              ? freeSlots
              : freeSlots.filter(s => {
                  if (lockedSubjectDays.has(`${sid}-${s.day}`)) return false;
                  if (curUsedSubjectDays.has(`${sid}-${s.day}`)) return false;
                  if (toInsert.some(r => String(r.subject_id) === sid && r.day_of_week === s.day)) return false;
                  return true;
                });

            for (const slot of slotsToTry) {
              if (placedCount >= job.periods_needed) break;
              if (curUsedRoomSlots.has(`${slot.day}-${slot.slotId}`)) continue;
              if (job.teacher_id && curUsedTeacherSlots.has(`${job.teacher_id}-${slot.day}-${slot.slotId}`)) continue;
              if (lockedSubjectDays.has(`${sid}-${slot.day}`)) continue;
              if (!allowSameDay) {
                const slotsInDay = [
                  ...existing.filter((r: any) => r.day_of_week === slot.day).map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => String(s.id) === String(r.subject_id))?.name || "" })),
                  ...toInsert.filter(r => r.day_of_week === slot.day).map(r => ({ slot_id: r.slot_id, subjectName: subjects.find(s => String(s.id) === String(r.subject_id))?.name || "" })),
                ].filter(r => r.slot_id !== slot.slotId);
                if (wouldViolateMathAdjacentRule(jobSubjectName, slot.slotId, slotsInDay)) continue;
                // กฎ A: วิชา > 2 คาบ ห้ามวันติดกัน (SOFT รอบแรกเท่านั้น)
                const usedDaysForSubject = [
                  ...existing.filter((r: any) => String(r.subject_id) === sid).map((r: any) => r.day_of_week as string),
                  ...toInsert.filter(r => String(r.subject_id) === sid).map(r => r.day_of_week as string),
                ];
                if (wouldViolateSpreadRule(job.periods_needed + placedCount, slot.day, usedDaysForSubject)) continue;
              }
              toInsert.push({ classroom_id: selectedRoom, subject_id: sid, teacher_id: job.teacher_id, day_of_week: slot.day, slot_id: slot.slotId, is_locked: false, major_group: job.major_group, academic_year: termInfo.year, semester: termInfo.semester });
              curUsedRoomSlots.add(`${slot.day}-${slot.slotId}`);
              curUsedSubjectDays.add(`${sid}-${slot.day}`);
              if (job.teacher_id) curUsedTeacherSlots.add(`${job.teacher_id}-${slot.day}-${slot.slotId}`);
              placedCount++;
            }
          }
          if (placedCount < job.periods_needed) failedJobs.push({ subject_id: sid, reason: `ลงได้ ${placedCount}/${job.periods_needed} คาบ` });
        }

        // เก็บผลดีที่สุด (failed น้อยที่สุด)
        if (failedJobs.length < bestFailed.length) {
          bestResult = toInsert;
          bestFailed = failedJobs;
        }
        if (bestFailed.length === 0) break; // ครบแล้ว หยุดทันที

        // ปล่อย UI หายใจทุก 10 รอบ
        if (attempt % 10 === 0) await new Promise(r => setTimeout(r, 0));
      }

      if (bestResult.length > 0) { const { error: e } = await supabase.from("teaching_assignments").insert(bestResult); if (e) throw e; }

      if (bestFailed.length > 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const lines = bestFailed.map(f => { const sub = subjects.find(s => String(s.id) === f.subject_id); return `• ${sub?.code || ""} ${sub?.name || f.subject_id}: ${f.reason}`; });
        alert(`⚠️ จัดตารางไม่ครบ ${bestFailed.length} วิชา (ลองแล้ว ${attempt} รอบ ใช้เวลา ${elapsed}s):\n\n${lines.join("\n")}\n\n💡 อาจเกิดจากครูติดคาบมากเกินไป หรือวิชาที่ต้องการมากกว่า 5 วัน`);
      }
    } catch (err: any) { alert("เกิดข้อผิดพลาด: " + err.message); }
    finally { setIsLoading(false); await fetchSchedule(); }
  }

  async function handleAutoAssignAll() {
    if (!confirm("🌐 จัดตารางสอนทุกห้องพร้อมกัน\n\nระบบจะ:\n• โหลดโครงสร้างทุกห้องพร้อมกัน\n• แจกครูอย่างยุติธรรม (ไม่มีห้องไหนได้เปรียบ)\n• ล้างเฉพาะคาบที่ไม่ได้ล็อก\n\nใช้เวลาสักครู่ ต้องการดำเนินการหรือไม่?")) return;
    setIsLoading(true);
    try {
      const { data: allClassrooms, error: clsErr } = await supabase.from("classrooms").select("id, name").order("name");
      if (clsErr || !allClassrooms?.length) { alert("⚠️ ไม่พบข้อมูลห้องเรียน"); return; }
      const { data: allStructures, error: strErr } = await supabase.from("course_structures").select("*, course_teachers(teacher_id)").eq("academic_year", termInfo.year);
      if (strErr || !allStructures?.length) { alert("⚠️ ไม่พบโครงสร้างรายวิชา"); return; }
      const { data: existingAll, error: exErr } = await supabase.from("teaching_assignments").select("id, classroom_id, day_of_week, slot_id, teacher_id, subject_id, activity_type, is_locked").eq("academic_year", termInfo.year).eq("semester", termInfo.semester);
      if (exErr) throw exErr;

      // ── ตรวจสอบ locked ที่ผิดกฎก่อนจัด (ทุกห้อง) ──
      const allLockedOnly = (existingAll || []).filter((r: any) => r.is_locked && !r.activity_type);
      const allLockedWarnings: string[] = [];

      // จัดกลุ่มต่อห้อง
      const lockedByRoomDay: Record<string, { slot_id: number; subject_id: string; day: string; roomName: string }[]> = {};
      for (const r of allLockedOnly) {
        const cid = String(r.classroom_id);
        if (!lockedByRoomDay[cid]) lockedByRoomDay[cid] = [];
        const roomName = allClassrooms.find(c => String(c.id) === cid)?.name || cid;
        lockedByRoomDay[cid].push({ slot_id: r.slot_id, subject_id: String(r.subject_id), day: r.day_of_week, roomName });
      }

      for (const [, slots] of Object.entries(lockedByRoomDay)) {
        const roomName = slots[0]?.roomName || "";
        // วิชาซ้ำวัน
        const dayCount: Record<string, string[]> = {};
        for (const r of slots) {
          const key = `${r.subject_id}-${r.day}`;
          if (!dayCount[key]) dayCount[key] = [];
          dayCount[key].push(`คาบ ${r.slot_id}`);
        }
        for (const [key, s] of Object.entries(dayCount)) {
          if (s.length > 1) {
            const [sid, day] = key.split("-");
            const subName = subjects.find(sub => String(sub.id) === sid)?.name || sid;
            allLockedWarnings.push(`ห้อง ${roomName}: "${subName}" ซ้ำวัน${day} (${s.join(", ")})`);
          }
        }
        // คณิตติดกัน
        const byDay: Record<string, typeof slots> = {};
        for (const r of slots) { if (!byDay[r.day]) byDay[r.day] = []; byDay[r.day].push(r); }
        for (const [day, daySlots] of Object.entries(byDay)) {
          for (const s of daySlots) {
            const subName = subjects.find(sub => String(sub.id) === s.subject_id)?.name || "";
            if (!isMathSubject(subName)) continue;
            const others = daySlots.filter(o => o.slot_id !== s.slot_id).map(o => ({ slot_id: o.slot_id, subjectName: subjects.find(sub => String(sub.id) === o.subject_id)?.name || "" }));
            if (wouldViolateMathAdjacentRule(subName, s.slot_id, others)) {
              allLockedWarnings.push(`ห้อง ${roomName}: "${subName}" ติดกับคณิตในวัน${day} คาบ ${s.slot_id}`);
            }
          }
        }
      }

      if (allLockedWarnings.length > 0) {
        const unique = [...new Set(allLockedWarnings)];
        const preview = unique.slice(0, 10).map((w, i) => `${i + 1}. ${w}`).join("\n");
        const more = unique.length > 10 ? `\n... และอีก ${unique.length - 10} รายการ` : "";
        alert(`🔒 พบปัญหาในคาบที่ล็อกไว้ (${unique.length} รายการ):\n\n${preview}${more}\n\n⚠️ กรุณาแก้คาบที่ล็อกให้ถูกต้องก่อนกดจัดอัตโนมัติ`);
        return;
      }

      const { error: delErr } = await supabase.from("teaching_assignments").delete().eq("academic_year", termInfo.year).eq("semester", termInfo.semester).eq("is_locked", false);
      if (delErr) throw delErr;

      const lockedData = (existingAll || []).filter((r: any) => r.is_locked);

      // สร้าง locked state (คงที่ตลอด — ไม่เปลี่ยนระหว่าง retry)
      const lockedTeacherSlots = new Set<string>(lockedData.filter((r: any) => r.teacher_id).map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`));
      const lockedClsSlots: Record<string, Set<string>> = {};
      const lockedClsSubjectDays: Record<string, Set<string>> = {};
      const lockedSubjectDaysByRoom: Record<string, Set<string>> = {};
      for (const r of lockedData) {
        const cid = String((r as any).classroom_id);
        if (!lockedClsSlots[cid]) lockedClsSlots[cid] = new Set();
        lockedClsSlots[cid].add(`${(r as any).day_of_week}-${(r as any).slot_id}`);
        if (!lockedClsSubjectDays[cid]) lockedClsSubjectDays[cid] = new Set();
        if (!lockedSubjectDaysByRoom[cid]) lockedSubjectDaysByRoom[cid] = new Set();
        if (!(r as any).activity_type) {
          lockedClsSubjectDays[cid].add(`${String((r as any).subject_id)}-${(r as any).day_of_week}`);
          lockedSubjectDaysByRoom[cid].add(`${String((r as any).subject_id)}-${(r as any).day_of_week}`);
        }
      }

      type Job = { classroom_id: string; subject_id: string; teacher_id: string | null; periods_needed: number; major_group: string; };
      const jobsTemplate: Job[] = [];
      for (const cls of allClassrooms) {
        const cid = String(cls.id);
        const clsStructures = allStructures.filter((s: any) => String(s.classroom_id) === cid);
        const clsLocked = lockedData.filter((r: any) => String(r.classroom_id) === cid);
        const lockedCount: Record<string, number> = {};
        for (const r of clsLocked) { if (!(r as any).activity_type) { const k = String((r as any).subject_id); lockedCount[k] = (lockedCount[k] || 0) + 1; } }
        // dedup subject_id: ถ้ามีหลาย row ต่อวิชา (major_group ต่างกัน) ใช้ periods สูงสุด
        const dedupStructures: Record<string, any> = {};
        for (const s of clsStructures) {
          const k = String(s.subject_id);
          if (!dedupStructures[k] || (s.periods_per_week || 1) > (dedupStructures[k].periods_per_week || 1))
            dedupStructures[k] = s;
        }
        for (const s of Object.values(dedupStructures)) {
          const needed = Math.max(0, (s.periods_per_week || 1) - (lockedCount[String(s.subject_id)] || 0));
          if (needed > 0) jobsTemplate.push({ classroom_id: cid, subject_id: String(s.subject_id), teacher_id: s.course_teachers?.[0]?.teacher_id || null, periods_needed: needed, major_group: s.major_group || "ทั้งหมด" });
        }
      }

      const allSlotsBase = days.flatMap(d => realSlotIds.map(slotId => ({ day: d, slotId })));
      const teacherBusyCount: Record<string, number> = {};
      for (const key of lockedTeacherSlots) { const tid = key.split("-")[0]; teacherBusyCount[tid] = (teacherBusyCount[tid] || 0) + 1; }

      // ── retry loop ──
      const TIMEOUT_MS = 10_000;
      const startTime = Date.now();
      let bestResult: any[] = [];
      let bestFailed: { classroom_id: string; subject_id: string }[] = jobsTemplate.map(j => ({ classroom_id: j.classroom_id, subject_id: j.subject_id }));
      let attempt = 0;

      while (Date.now() - startTime < TIMEOUT_MS) {
        attempt++;

        // clone jobs ทุกรอบ
        const jobsByRoom: Record<string, Job[]> = {};
        for (const j of jobsTemplate) {
          if (!jobsByRoom[j.classroom_id]) jobsByRoom[j.classroom_id] = [];
          jobsByRoom[j.classroom_id].push({ ...j });
        }
        for (const cid of Object.keys(jobsByRoom)) {
          jobsByRoom[cid].sort((a, b) => {
            const aB = a.teacher_id ? (teacherBusyCount[String(a.teacher_id)] || 0) : 0;
            const bB = b.teacher_id ? (teacherBusyCount[String(b.teacher_id)] || 0) : 0;
            return bB - aB || b.periods_needed - a.periods_needed;
          });
        }

        // clone state จาก locked
        const globalUsedTeacherSlots = new Set(lockedTeacherSlots);
        const clsUsedSlots: Record<string, Set<string>> = {};
        const clsUsedSubjectDays: Record<string, Set<string>> = {};
        for (const cid of Object.keys(lockedClsSlots)) clsUsedSlots[cid] = new Set(lockedClsSlots[cid]);
        for (const cid of Object.keys(lockedClsSubjectDays)) clsUsedSubjectDays[cid] = new Set(lockedClsSubjectDays[cid]);

        const toInsertAll: any[] = [];

        for (const allowSameDay of [false, true]) {
          for (const cls of shuffle([...allClassrooms])) {
            const cid = String(cls.id);
            for (const job of (jobsByRoom[cid] || [])) {
              if (job.periods_needed <= 0) continue;
              const sid = job.subject_id;
              const taken = clsUsedSlots[cid] || new Set<string>();
              const freeRaw = allSlotsBase.filter(s => !taken.has(`${s.day}-${s.slotId}`));
              const byDay: Record<string, typeof freeRaw> = {};
              for (const s of freeRaw) { if (!byDay[s.day]) byDay[s.day] = []; byDay[s.day].push(s); }
              const spreadDays = shuffle(days.filter(d => byDay[d]?.length));
              const freeSlots: typeof freeRaw = [];
              const maxLen = Math.max(0, ...spreadDays.map(d => byDay[d].length));
              for (let i = 0; i < maxLen; i++) for (const d of spreadDays) if (byDay[d]?.[i]) freeSlots.push(byDay[d][i]);

              const slotsToTry = allowSameDay
                ? freeSlots
                : freeSlots.filter(s => {
                    if ((lockedSubjectDaysByRoom[cid] || new Set()).has(`${sid}-${s.day}`)) return false;
                    if ((clsUsedSubjectDays[cid] || new Set()).has(`${sid}-${s.day}`)) return false;
                    if (toInsertAll.some(r => String(r.subject_id) === sid && String(r.classroom_id) === cid && r.day_of_week === s.day)) return false;
                    return true;
                  });

              const jobSubjectName = subjects.find(s => String(s.id) === sid)?.name || "";
              for (const slot of slotsToTry) {
                if (job.periods_needed <= 0) break;
                if ((clsUsedSlots[cid] || new Set()).has(`${slot.day}-${slot.slotId}`)) continue;
                if (job.teacher_id && (globalUsedTeacherSlots.has(`${job.teacher_id}-${slot.day}-${slot.slotId}`) || toInsertAll.some(r => String(r.teacher_id) === String(job.teacher_id) && r.day_of_week === slot.day && r.slot_id === slot.slotId))) continue;
                if ((lockedSubjectDaysByRoom[cid] || new Set()).has(`${sid}-${slot.day}`)) continue;
                if (!allowSameDay) {
                  const slotsInDay = [
                    ...lockedData.filter((r: any) => String(r.classroom_id) === cid && r.day_of_week === slot.day).map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => String(s.id) === String(r.subject_id))?.name || "" })),
                    ...toInsertAll.filter(r => String(r.classroom_id) === cid && r.day_of_week === slot.day).map(r => ({ slot_id: r.slot_id, subjectName: subjects.find(s => String(s.id) === String(r.subject_id))?.name || "" })),
                  ].filter(r => r.slot_id !== slot.slotId);
                  if (wouldViolateMathAdjacentRule(jobSubjectName, slot.slotId, slotsInDay)) continue;
                  // กฎ A: วิชา > 2 คาบ ห้ามวันติดกัน (SOFT รอบแรกเท่านั้น)
                  const usedDaysForSubject = [
                    ...lockedData.filter((r: any) => String(r.classroom_id) === cid && String(r.subject_id) === sid).map((r: any) => r.day_of_week as string),
                    ...toInsertAll.filter(r => String(r.classroom_id) === cid && String(r.subject_id) === sid).map(r => r.day_of_week as string),
                  ];
                  if (wouldViolateSpreadRule(job.periods_needed, slot.day, usedDaysForSubject)) continue;
                }
                toInsertAll.push({ classroom_id: cid, subject_id: sid, teacher_id: job.teacher_id, day_of_week: slot.day, slot_id: slot.slotId, is_locked: false, major_group: job.major_group, academic_year: termInfo.year, semester: termInfo.semester });
                globalUsedTeacherSlots.add(`${job.teacher_id}-${slot.day}-${slot.slotId}`);
                if (!clsUsedSlots[cid]) clsUsedSlots[cid] = new Set();
                clsUsedSlots[cid].add(`${slot.day}-${slot.slotId}`);
                if (!clsUsedSubjectDays[cid]) clsUsedSubjectDays[cid] = new Set();
                clsUsedSubjectDays[cid].add(`${sid}-${slot.day}`);
                job.periods_needed--;
              }
            }
          }
        }

        const failedAll: { classroom_id: string; subject_id: string }[] = [];
        for (const jobs of Object.values(jobsByRoom)) for (const j of jobs) if (j.periods_needed > 0) failedAll.push({ classroom_id: j.classroom_id, subject_id: j.subject_id });

        // เก็บผลดีที่สุด
        if (failedAll.length < bestFailed.length) {
          bestResult = toInsertAll;
          bestFailed = failedAll;
        }
        if (bestFailed.length === 0) break; // ครบแล้ว หยุดทันที

        if (attempt % 5 === 0) await new Promise(r => setTimeout(r, 0)); // ปล่อย UI หายใจ
      }

      if (bestResult.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < bestResult.length; i += CHUNK) { const { error: e } = await supabase.from("teaching_assignments").insert(bestResult.slice(i, i + CHUNK)); if (e) throw e; }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (bestFailed.length > 0) {
        const lines = bestFailed.slice(0, 10).map(f => { const cls = allClassrooms.find(c => String(c.id) === f.classroom_id); const sub = subjects.find(s => String(s.id) === f.subject_id); return `• ${cls?.name || f.classroom_id}: ${sub?.name || f.subject_id}`; });
        const more = bestFailed.length > 10 ? `\n... และอีก ${bestFailed.length - 10} วิชา` : "";
        alert(`✅ จัดครบ ${bestResult.length} คาบ ใน ${allClassrooms.length} ห้อง (ลองแล้ว ${attempt} รอบ ใช้เวลา ${elapsed}s)\n\n⚠️ ไม่สามารถจัด ${bestFailed.length} วิชา:\n${lines.join("\n")}${more}\n\n💡 อาจเกิดจากครูติดคาบมากเกินไป`);
      } else {
        alert(`✅ จัดตารางสอนครบทุกห้องเรียบร้อย!\n\n📊 สรุป: ${allClassrooms.length} ห้อง | ${bestResult.length} คาบ | ${attempt} รอบ | ${elapsed}s`);
      }
    } catch (err: any) { alert("เกิดข้อผิดพลาด: " + err.message); }
    finally { setIsLoading(false); await fetchSchedule(); }
  }

  async function handleSaveGlobalSubject() {
    const isFreeMode = fixedFormData.subject_id === '__free__';
    if (!isFreeMode && !fixedFormData.subject_id) return;
    let targetRooms = classrooms;
    if (fixedFormData.target_level !== 'all') targetRooms = classrooms.filter(r => r.name.trim().startsWith(fixedFormData.target_level) || r.name.trim().startsWith("ม." + fixedFormData.target_level));
    if (targetRooms.length === 0) return;
    setIsLoading(true);
    try {
      const targetRoomIds = targetRooms.map(r => r.id);
      await supabase.from("teaching_assignments").delete().eq("academic_year", termInfo.year).eq("semester", termInfo.semester).eq("day_of_week", fixedFormData.day_of_week).eq("slot_id", fixedFormData.slot_id).in("classroom_id", targetRoomIds);
      if (!isFreeMode) {
        const { error } = await supabase.from("teaching_assignments").insert(targetRooms.map(room => ({ classroom_id: room.id, subject_id: fixedFormData.subject_id, teacher_id: fixedFormData.teacher_id || null, day_of_week: fixedFormData.day_of_week, slot_id: fixedFormData.slot_id, is_locked: true, major_group: fixedFormData.major_group || "ทั้งหมด", academic_year: termInfo.year, semester: termInfo.semester })));
        if (error) throw error;
      }
      setIsFixedModalOpen(false);
      await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
    } catch (err: any) { console.error(err); } finally { setIsLoading(false); }
  }

  async function handleDelete(id: number) { await supabase.from("teaching_assignments").delete().eq("id", id); await fetchSchedule(); }

  async function clearSchedule(mode: "unlocked" | "all", scope: "room" | "all") {
    if (mode === "all") {
      const scopeLabel = scope === "all" ? "ทุกห้องเรียน" : `ห้อง ${selectedRoomName}`;
      if (!confirm(`⚠️ ยืนยันการล้างวิชาที่ล็อก\n\nคุณกำลังจะลบวิชาที่ล็อกทั้งหมดใน${scopeLabel}\nข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้\n\nกด OK เพื่อยืนยัน`)) return;
    }
    setIsLoading(true); setShowClearModal(false);
    try {
      let query = supabase.from("teaching_assignments").delete().eq("academic_year", termInfo.year).eq("semester", termInfo.semester);
      if (scope === "room") query = query.eq("classroom_id", selectedRoom);
      if (mode === "unlocked") query = query.eq("is_locked", false);
      await query;
      await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
    } finally { setIsLoading(false); }
  }

  const selectedRoomName = classrooms.find(c => String(c.id) === String(selectedRoom))?.name ?? selectedRoom;
  const structureSubjectIds = new Set((courseStructures || []).map((s: any) => String(s.subject_id)));
  const extraSubjects: { subject_id: string; subject_code: string; subject_name: string; teacher_name: string; count: number }[] = [];
  if (courseStructures.length > 0) {
    const extraMap: Record<string, { subject_id: string; subject_code: string; subject_name: string; teacher_name: string; slots: Set<string> }> = {};
    for (const a of scheduleData) {
      if (!a.activity_type && !structureSubjectIds.has(String(a.subject_id))) {
        const key = String(a.subject_id);
        if (!extraMap[key]) extraMap[key] = { subject_id: key, subject_code: a.subjects?.code || "-", subject_name: a.subjects?.name || String(a.subject_id), teacher_name: a.teachers?.full_name || "-", slots: new Set() };
        extraMap[key].slots.add(`${a.day_of_week}-${a.slot_id}`);
      }
    }
    for (const v of Object.values(extraMap)) extraSubjects.push({ ...v, count: v.slots.size });
    extraSubjects.sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  }

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
            <select className="w-full p-2 border rounded-lg bg-slate-50 outline-none text-sm focus:ring-2 ring-indigo-500/20" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
              <option value="">-- เลือกห้องเรียน --</option>
              {classrooms.map(r => <option key={r.id} value={r.id}>ห้อง {r.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setIsFixedModalOpen(true)} className="flex-1 md:flex-none px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition shadow-sm flex items-center gap-2">⚙️ ลงวิชาส่วนกลาง</button>
            <button onClick={handleAutoAssign} disabled={!selectedRoom} className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition shadow-sm disabled:opacity-50">🤖 จัดอัตโนมัติ</button>
            <button onClick={handleAutoAssignAll} className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition shadow-sm flex items-center gap-1">🌐 จัดทุกห้องพร้อมกัน</button>
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
                        {s.isBreak ? <div className="text-[8px] text-slate-400 leading-tight">{s.label}</div> : <><div className="text-[10px] font-bold text-indigo-900">{s.label}</div><div className="text-[8px] text-slate-400 font-normal leading-tight">{s.time}</div></>}
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
                        const grouped: { primary: ScheduleItem; teacherNames: string[] }[] = [];
                        for (const m of matches) {
                          const g = grouped.find(g => g.primary.subject_id === m.subject_id);
                          if (g) { if (m.teachers?.full_name) g.teacherNames.push(m.teachers.full_name); }
                          else grouped.push({ primary: m, teacherNames: m.teachers?.full_name ? [m.teachers.full_name] : [] });
                        }
                        return (
                          <td key={slot.id} className="border-r p-0.5 align-top relative group" style={{ height: '112px' }}
                            onClick={() => { if (grouped.length === 0) { setEditingId(null); setFormData({ subject_id: "", teacher_ids: [""], major_group: "ทั้งหมด", is_locked: true }); setSubjectSearch(""); setSubjectDropdownOpen(false); setTeacherSearch(""); setTeacherDropdownOpen(false); setActiveSlot({ day, slotId: Number(slot.id) }); setIsModalOpen(true); } }}>
                            {isModalOpen && formData.subject_id && grouped.length === 0 && (() => {
                              const st = slotStatus[`${day}-${slot.id}`];
                              if (!st) return null;
                              const overlay = st === "safe" ? "bg-emerald-100 ring-2 ring-inset ring-emerald-400" : st === "warn" ? "bg-yellow-100 ring-2 ring-inset ring-yellow-400" : "bg-red-50 ring-1 ring-inset ring-red-300 opacity-60";
                              const icon = st === "safe" ? <span className="text-emerald-500 text-base">✓</span> : st === "warn" ? <span className="text-yellow-500 text-base">⚠</span> : <span className="text-red-400 text-base">✕</span>;
                              return <div className={`absolute inset-0 rounded flex items-center justify-center transition-all pointer-events-none ${overlay}`}>{icon}</div>;
                            })()}
                            {grouped.length === 0 && <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition"><span className="text-indigo-400 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded-full">+</span></div>}
                            {grouped.map(({ primary: m, teacherNames }) => (
                              <div key={m.id} onClick={(e) => { e.stopPropagation(); handleEditClick(m); }}
                                className={`h-full flex flex-col p-2 rounded-lg border shadow-sm relative mb-0.5 cursor-pointer hover:scale-[1.02] transition-all overflow-hidden ${m.is_locked ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-300' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                                <button onClick={(e) => { e.stopPropagation(); matches.forEach(x => { if (x.id) handleDelete(x.id); }); }} className="absolute top-0.5 right-0.5 bg-red-100 text-red-600 rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-200 shadow-sm z-20 text-[10px] leading-none">×</button>
                                <div className="font-bold text-indigo-900 line-clamp-2 text-[11px] leading-snug">{m.subjects?.name}</div>
                                <div className="mt-0.5 space-y-0.5">
                                  {teacherNames.map((name, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <span className={`w-3 h-3 rounded-full flex-shrink-0 text-[7px] flex items-center justify-center font-bold ${TEACHER_BADGE_COLORS[i % TEACHER_BADGE_COLORS.length].dot}`}>{i + 1}</span>
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
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">{structureSummary.some(i => i.placed < i.needed) ? '⚠️' : '✅'} สรุปสถานะรายวิชา</h3>
                  <p className="text-sm text-slate-500 mt-0.5">ลงแล้ว <span className="font-bold text-indigo-600">{structureSummary.reduce((s, i) => s + Math.min(i.placed, i.needed), 0)}</span> คาบ จากทั้งหมด <span className="font-bold">{structureSummary.reduce((s, i) => s + i.needed, 0)}</span> คาบ</p>
                </div>
                <div className="space-y-4">
                  {structureSummary.filter(i => i.placed < i.needed).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>ลงไม่ครบ ({structureSummary.filter(i => i.placed < i.needed).length} วิชา)</div>
                      <div className="overflow-hidden rounded-lg border border-red-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-red-100/60 text-red-600 text-xs font-semibold"><tr>{["รหัสวิชา","ชื่อวิชา","ครูผู้สอน","ลงได้","ขาด"].map(h => <th key={h} className="px-4 py-2 border-b border-red-200">{h}</th>)}</tr></thead>
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
                      <div className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>ลงครบทุกคาบ ({structureSummary.filter(i => i.placed === i.needed).length} วิชา)</div>
                      <div className="overflow-hidden rounded-lg border border-green-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-green-100/60 text-green-700 text-xs font-semibold"><tr>{["รหัสวิชา","ชื่อวิชา","ครูผู้สอน","จำนวนคาบ"].map(h => <th key={h} className="px-4 py-2 border-b border-green-200">{h}</th>)}</tr></thead>
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
                  {structureSummary.filter(i => i.rawPlaced > i.needed).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-orange-400 uppercase mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>ลงเกินจำนวน ({structureSummary.filter(i => i.rawPlaced > i.needed).length} วิชา)</div>
                      <div className="overflow-hidden rounded-lg border border-orange-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-orange-50 text-orange-600 text-xs font-semibold"><tr>{["รหัสวิชา","ชื่อวิชา","ครูผู้สอน","ลงได้/ควรมี","เกิน"].map(h => <th key={h} className="px-4 py-2 border-b border-orange-200">{h}</th>)}</tr></thead>
                          <tbody className="divide-y divide-orange-100 bg-white">
                            {structureSummary.filter(i => i.rawPlaced > i.needed).map((item, idx) => (
                              <tr key={`over-${item.subject_id}-${idx}`} className="hover:bg-orange-50">
                                <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                                <td className="px-4 py-2.5 text-center font-bold text-slate-600">{item.rawPlaced}/{item.needed}</td>
                                <td className="px-4 py-2.5 text-center"><span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-bold text-xs">+{item.rawPlaced - item.needed} คาบ</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {extraSubjects.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-orange-500 uppercase mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>ลงผิดวิชา / ไม่อยู่ในโครงสร้าง ({extraSubjects.length} วิชา)</div>
                      <div className="overflow-hidden rounded-lg border border-orange-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-orange-100/60 text-orange-700 text-xs font-semibold"><tr>{["รหัสวิชา","ชื่อวิชา","ครูผู้สอน","จำนวนคาบ",""].map(h => <th key={h} className="px-4 py-2 border-b border-orange-200">{h}</th>)}</tr></thead>
                          <tbody className="divide-y divide-orange-100 bg-white">
                            {extraSubjects.map(item => (
                              <tr key={item.subject_id} className="hover:bg-orange-50">
                                <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                                <td className="px-4 py-2.5 text-center"><span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold text-xs">{item.count} คาบ</span></td>
                                <td className="px-4 py-2.5 text-center"><span className="text-[10px] text-orange-500 font-semibold bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">⚠️ ไม่ตรงโครงสร้าง</span></td>
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px] flex items-center justify-center p-4">
          {formData.subject_id && (
            <div className="fixed bottom-5 left-5 bg-white rounded-xl shadow-lg border px-3 py-2 flex items-center gap-3 text-xs z-[60]">
              <span className="font-semibold text-slate-500">ช่องว่าง:</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400 inline-block"/>ลงได้</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400 inline-block"/>ควรระวัง</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-300 inline-block"/>ชน</span>
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border" style={{ overflow: 'visible' }}>
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center rounded-t-2xl">
              <h3 className="font-bold text-slate-800">{editingId ? '📝 แก้ไขข้อมูลคาบเรียน' : `ลงวิชาห้อง ${selectedRoomName}`}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); setSubjectDropdownOpen(false); setSubjectSearch(""); setTeacherDropdownOpen(false); setTeacherSearch(""); }} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="text-xs text-slate-500 font-bold uppercase">วัน{activeSlot?.day} คาบที่ {activeSlot?.slotId}</div>
              <div className="relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">วิชา</label>
                <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm" onClick={() => setSubjectDropdownOpen(prev => !prev)}>
                  <span className={formData.subject_id ? "text-slate-800" : "text-slate-400"}>{formData.subject_id ? (() => { const s = subjects.find(s => s.id === formData.subject_id); return s ? `${s.code} - ${s.name}` : "-- เลือกวิชา --"; })() : "-- เลือกวิชา --"}</span>
                  <span className="text-slate-400 text-xs ml-2">{subjectDropdownOpen ? "▲" : "▼"}</span>
                </div>
                {subjectDropdownOpen && (
                  <div className="absolute z-[60] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b"><input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300" placeholder="🔍 ค้นหารหัสหรือชื่อวิชา..." value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)} onClick={e => e.stopPropagation()} /></div>
                    <div className="max-h-52 overflow-y-auto">
                      <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer" onClick={() => { setFormData({ ...formData, subject_id: "" }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>-- เลือกวิชา --</div>
                      {subjectsForSelectedRoom.filter(s => subjectSearch === "" || s.code.toLowerCase().includes(subjectSearch.toLowerCase()) || s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(s => (
                        <div key={s.id} className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${formData.subject_id === s.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`} onClick={() => { setFormData({ ...formData, subject_id: s.id }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>
                          <span className="font-mono text-xs text-slate-400 mr-2">{s.code}</span>{s.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">ครูผู้สอน <span className="ml-1.5 normal-case font-normal text-slate-300">({formData.teacher_ids.length}/{MAX_TEACHERS} คน)</span></label>
                  {formData.teacher_ids.length < MAX_TEACHERS && <button type="button" onClick={() => setFormData(f => ({ ...f, teacher_ids: [...f.teacher_ids, ""] }))} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold px-2.5 py-1 rounded-lg hover:bg-indigo-50 border border-indigo-200 transition">+ เพิ่มครู</button>}
                </div>
                <div className="space-y-2">
                  {formData.teacher_ids.map((tid, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${TEACHER_BADGE_COLORS[idx % TEACHER_BADGE_COLORS.length].badge}`}>{idx + 1}</div>
                      <div className="relative flex-1">
                        <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm" onClick={() => { setTeacherDropdownOpen(teacherDropdownOpen === idx ? false : idx); setTeacherSearch(""); }}>
                          <span className={tid ? "text-slate-800" : "text-slate-400"}>{tid ? teachers.find(t => t.id === tid)?.full_name || "-- เลือกครู --" : `-- ครูคนที่ ${idx + 1} --`}</span>
                          <span className="text-slate-400 text-xs ml-2">{teacherDropdownOpen === idx ? "▲" : "▼"}</span>
                        </div>
                        {teacherDropdownOpen === idx && (
                          <div className="absolute z-[60] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                            <div className="p-2 border-b"><input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300" placeholder="🔍 ค้นหาชื่อครู..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)} onClick={e => e.stopPropagation()} /></div>
                            <div className="max-h-52 overflow-y-auto">
                              <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer border-b" onClick={() => { setFormData(f => { const ids = [...f.teacher_ids]; ids[idx] = ""; return { ...f, teacher_ids: ids }; }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}>-- ไม่ระบุ --</div>
                              {(() => {
                                const filtered = teachers.filter(t => (teacherSearch === "" || t.full_name.toLowerCase().includes(teacherSearch.toLowerCase())) && !formData.teacher_ids.some((selId, i) => i !== idx && selId === t.id));
                                const entries = fuzzyGroupedTeachers.map(([dept, list]) => [dept, list.filter((t: Teacher) => filtered.find(f => f.id === t.id))] as [string, Teacher[]]).filter(([, list]) => list.length > 0);
                                if (entries.length === 0) return <div className="px-3 py-3 text-sm text-slate-400 text-center">ไม่พบครู</div>;
                                return entries.map(([dept, list]) => (
                                  <div key={dept}>
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-b border-t sticky top-0">{dept}</div>
                                    {list.map((t: Teacher) => <div key={t.id} className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${tid === t.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`} onClick={() => { setFormData(f => { const ids = [...f.teacher_ids]; ids[idx] = t.id; return { ...f, teacher_ids: ids }; }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}>{t.full_name}</div>)}
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                      {idx > 0 && <button type="button" onClick={() => setFormData(f => ({ ...f, teacher_ids: f.teacher_ids.filter((_, i) => i !== idx) }))} className="w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center flex-shrink-0 transition text-sm border border-red-100">✕</button>}
                    </div>
                  ))}
                </div>
                {formData.teacher_ids.length < MAX_TEACHERS ? <p className="text-[10px] text-slate-400 mt-2">กด &quot;+ เพิ่มครู&quot; เพื่อเพิ่มได้อีก {MAX_TEACHERS - formData.teacher_ids.length} คน (สูงสุด {MAX_TEACHERS} คน)</p> : <p className="text-[10px] text-indigo-400 mt-2 font-semibold">ครบ {MAX_TEACHERS} คนแล้ว (สูงสุด)</p>}
              </div>
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">กลุ่มเรียน</label>
                  <input className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none text-sm" placeholder="เช่น ทั้งหมด, กลุ่ม A, ..." value={formData.major_group} onChange={e => setFormData({ ...formData, major_group: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={formData.is_locked} onChange={e => setFormData({ ...formData, is_locked: e.target.checked })} />
                  <span className="text-slate-600 font-medium">🔒 ล็อกคาบนี้</span>
                </label>
              </div>
              <div className="pt-1 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 mb-2 font-semibold uppercase">ลงคาบว่างพร้อมกันทุกวัน</p>
                <button onClick={async () => {
                  if (!activeSlot || !selectedRoom) return;
                  setIsLoading(true);
                  const toInsert = days.filter(d => !scheduleData.some(a => a.day_of_week === d && a.slot_id === activeSlot.slotId)).map(d => ({ classroom_id: selectedRoom, subject_id: formData.subject_id || null, teacher_id: formData.teacher_ids[0] || null, day_of_week: d, slot_id: activeSlot.slotId, is_locked: formData.is_locked, major_group: formData.major_group || "ทั้งหมด", academic_year: termInfo.year, semester: termInfo.semester }));
                  if (toInsert.length > 0) await supabase.from("teaching_assignments").insert(toInsert);
                  setIsModalOpen(false); setEditingId(null);
                  await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
                  setIsLoading(false);
                }} className="w-full py-2.5 bg-slate-700 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition">📅 ลงคาบ {activeSlot?.slotId} ทุกวัน (เฉพาะช่องว่าง)</button>
              </div>
              <button onClick={handleSave} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm">{editingId ? '💾 บันทึกการแก้ไข' : '➕ เพิ่มคาบเรียน'}</button>
            </div>
          </div>
        </div>
      )}

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
                  {[{ value: 'subject', label: '📚 ลงวิชาเรียน', desc: 'เลือกวิชา+ครู ลงทุกห้องในชั้น' }, { value: 'free', label: '🕐 คาบว่าง/กิจกรรม', desc: 'ลงคาบว่างหรือกิจกรรมพร้อมกัน' }].map(m => (
                    <div key={m.value} onClick={() => setFixedFormData({ ...fixedFormData, subject_id: m.value === 'free' ? '__free__' : (fixedFormData.subject_id === '__free__' ? '' : fixedFormData.subject_id) })} className={`p-3 rounded-xl border-2 cursor-pointer transition ${(m.value === 'free' ? fixedFormData.subject_id === '__free__' : fixedFormData.subject_id !== '__free__') ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-200'}`}>
                      <div className="font-bold text-sm">{m.label}</div><div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">ระดับชั้นเป้าหมาย</label>
                <select className="w-full p-2.5 border rounded-xl bg-slate-50 font-bold text-slate-700 text-sm" value={fixedFormData.target_level} onChange={e => setFixedFormData({ ...fixedFormData, target_level: e.target.value, subject_id: fixedFormData.subject_id === '__free__' ? '__free__' : '' })}>
                  <option value="all">🌍 ทุกระดับชั้น</option>
                  {[1,2,3,4,5,6].map(lv => <option key={lv} value={String(lv)}>ม.{lv}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">วัน</label>
                  <select className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm font-bold text-slate-700" value={fixedFormData.day_of_week} onChange={e => setFixedFormData({ ...fixedFormData, day_of_week: e.target.value })}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">คาบ</label>
                  <select className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm font-bold text-slate-700" value={fixedFormData.slot_id} onChange={e => setFixedFormData({ ...fixedFormData, slot_id: Number(e.target.value) })}>{timeSlots.filter(s => !s.isBreak).map(s => <option key={s.id} value={Number(s.id)}>คาบ {s.id} ({s.time})</option>)}</select>
                </div>
              </div>
              {fixedFormData.subject_id !== '__free__' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">วิชาเรียน</label>
                  <div className="relative">
                    <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm" onClick={() => setSubjectDropdownOpen(p => !p)}>
                      <span className={fixedFormData.subject_id ? "text-slate-800" : "text-slate-400"}>{fixedFormData.subject_id ? (() => { const s = subjects.find(s => s.id === fixedFormData.subject_id); return s ? `${s.code} - ${s.name}` : "-- เลือกวิชา --"; })() : "-- เลือกวิชา --"}</span>
                      <span className="text-slate-400 text-xs">{subjectDropdownOpen ? "▲" : "▼"}</span>
                    </div>
                    {subjectDropdownOpen && (
                      <div className="absolute z-30 bottom-full mb-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b"><input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-amber-300" placeholder="🔍 ค้นหา..." value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)} onClick={e => e.stopPropagation()} /></div>
                        <div className="max-h-44 overflow-y-auto">
                          <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer" onClick={() => { setFixedFormData({ ...fixedFormData, subject_id: "" }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>-- เลือกวิชา --</div>
                          {subjectsForFixedModal.filter(s => subjectSearch === "" || s.code.toLowerCase().includes(subjectSearch.toLowerCase()) || s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(s => (
                            <div key={s.id} className={`px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 ${fixedFormData.subject_id === s.id ? "bg-amber-50 font-bold text-amber-700" : "text-slate-700"}`} onClick={() => { setFixedFormData({ ...fixedFormData, subject_id: s.id }); setSubjectDropdownOpen(false); setSubjectSearch(""); }}>
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
                  <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm" onClick={() => setTeacherDropdownOpen(teacherDropdownOpen === 99 ? false : 99)}>
                    <span className={fixedFormData.teacher_id ? "text-slate-800" : "text-slate-400"}>{fixedFormData.teacher_id ? teachers.find(t => t.id === fixedFormData.teacher_id)?.full_name || "-- เลือกครู --" : "-- เลือกครู --"}</span>
                    <span className="text-slate-400 text-xs">{teacherDropdownOpen === 99 ? "▲" : "▼"}</span>
                  </div>
                  {teacherDropdownOpen === 99 && (
                    <div className="absolute z-30 bottom-full mb-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b"><input autoFocus className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-amber-300" placeholder="🔍 ค้นหาชื่อครู..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)} onClick={e => e.stopPropagation()} /></div>
                      <div className="max-h-44 overflow-y-auto">
                        <div className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer border-b" onClick={() => { setFixedFormData({ ...fixedFormData, teacher_id: "" }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}>-- ไม่ระบุครู --</div>
                        {(() => {
                          const filtered = teachers.filter(t => teacherSearch === "" || t.full_name.toLowerCase().includes(teacherSearch.toLowerCase()));
                          const entries = fuzzyGroupedTeachers.map(([dept, list]) => [dept, list.filter((t: Teacher) => filtered.find(f => f.id === t.id))] as [string, Teacher[]]).filter(([, list]) => list.length > 0);
                          return entries.map(([dept, list]) => (
                            <div key={dept}>
                              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-y sticky top-0">{dept}</div>
                              {list.map((t: Teacher) => <div key={t.id} className={`px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 ${fixedFormData.teacher_id === t.id ? "bg-amber-50 font-bold text-amber-700" : "text-slate-700"}`} onClick={() => { setFixedFormData({ ...fixedFormData, teacher_id: t.id }); setTeacherDropdownOpen(false); setTeacherSearch(""); }}>{t.full_name}</div>)}
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
                <input className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm outline-none" placeholder="เช่น กิจกรรม, ชุมนุม, HR..." value={fixedFormData.major_group} onChange={e => setFixedFormData({ ...fixedFormData, major_group: e.target.value })} />
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
              <button onClick={handleSaveGlobalSubject} disabled={isLoading || (fixedFormData.subject_id !== '__free__' && !fixedFormData.subject_id)} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-bold shadow-lg hover:bg-amber-600 disabled:opacity-40 text-sm">{isLoading ? "กำลังประมวลผล..." : "✅ ยืนยันลงวิชา"}</button>
            </div>
          </div>
        </div>
      )}

      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border p-6 space-y-5">
            <div className="text-center"><div className="text-4xl mb-2">🗑️</div><h3 className="text-lg font-bold text-slate-800">ล้างตารางสอน</h3><p className="text-sm text-slate-500 mt-1">{clearScope === "room" ? `ห้อง ${selectedRoomName}` : "ทุกห้องเรียน"}</p></div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ขอบเขต</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ value: "room", icon: "🏫", label: "ห้องนี้เท่านั้น" }, { value: "all", icon: "🌐", label: "ทุกห้องพร้อมกัน" }].map(s => (
                  <div key={s.value} onClick={() => setClearScope(s.value as any)} className={`p-3 rounded-xl border-2 cursor-pointer transition text-center ${clearScope === s.value ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="text-xl mb-1">{s.icon}</div><div className={`text-xs font-bold ${clearScope === s.value ? "text-indigo-700" : "text-slate-600"}`}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">วิธีล้าง</p>
              <div className="space-y-2">
                {[{ value: "unlocked", icon: "🔓", label: "ล้างเฉพาะที่ไม่ได้ล็อก", desc: "วิชาที่ล็อก 🔒 จะยังคงอยู่", color: "amber" }, { value: "all", icon: "💣", label: "ล้างทั้งหมด", desc: "รวมวิชาที่ล็อกไว้ด้วย ไม่สามารถกู้คืนได้", color: "red" }].map(m => (
                  <div key={m.value} onClick={() => setClearMode(m.value as any)} className={`p-4 rounded-xl border-2 cursor-pointer transition ${clearMode === m.value ? `border-${m.color}-400 bg-${m.color}-50` : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{m.icon}</span>
                      <div><div className={`font-bold text-sm ${m.value === "all" ? "text-red-700" : "text-slate-800"}`}>{m.label}</div><div className="text-xs text-slate-500 mt-0.5">{m.desc}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {clearMode === "all" && clearScope === "all" && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3"><span className="text-red-500 text-lg mt-0.5">⚠️</span><p className="text-xs text-red-700 font-medium">จะลบวิชาที่ล็อกทุกห้อง — ระบบจะขอยืนยันอีกครั้งก่อนดำเนินการ</p></div>}
            {clearMode === "all" && clearScope === "room" && <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3"><span className="text-orange-500 text-lg mt-0.5">⚠️</span><p className="text-xs text-orange-700 font-medium">จะลบวิชาที่ล็อกในห้องนี้ด้วย — ระบบจะขอยืนยันอีกครั้ง</p></div>}
            <div className="flex gap-3">
              <button onClick={() => setShowClearModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => clearSchedule(clearMode, clearScope)} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition ${clearMode === "all" ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>{clearMode === "all" ? "💣 ล้างทั้งหมด" : "🔓 ล้างที่ไม่ล็อก"}</button>
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