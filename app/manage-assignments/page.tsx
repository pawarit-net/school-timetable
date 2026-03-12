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

// Badge สี per ลำดับครู (สูงสุด 4 คน)
const TEACHER_BADGE_COLORS = [
  { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-200 text-indigo-700' },
  { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-200 text-violet-700' },
  { badge: 'bg-pink-100 text-pink-700',    dot: 'bg-pink-200 text-pink-700' },
  { badge: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-200 text-teal-700' },
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

  const [activeSlot, setActiveSlot] = useState<{ day: string, slotId: number } | null>(null);
  const [termInfo, setTermInfo] = useState({ year: "2569", semester: "3" });
  const [editingId, setEditingId] = useState<number | null>(null);

  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState<number | false>(false);

  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<"unlocked" | "all">("unlocked");
  const [clearScope, setClearScope] = useState<"room" | "all">("room");

  // heatmap: สถานะแต่ละช่องขณะ modal เปิด
  const [slotStatus, setSlotStatus] = useState<Record<string, "safe" | "warn" | "conflict">>({});
  const [allRoomAssignments, setAllRoomAssignments] = useState<any[]>([]);
  const [courseStructures, setCourseStructures] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    subject_id: "",
    teacher_ids: [""] as string[],
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

  useEffect(() => {
    if (!selectedRoom) return;
    const channel = supabase
      .channel(`timetable-room-${selectedRoom}-${termInfo.year}-${termInfo.semester}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'teaching_assignments',
        filter: `classroom_id=eq.${selectedRoom}`
      }, () => { fetchSchedule(); })
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
      const [assignRes, structRes, allRoomsRes] = await Promise.all([
        supabase.from("teaching_assignments")
          .select(`*, subjects(code, name), teachers(full_name, department)`)
          .eq("classroom_id", room).eq("academic_year", yr).eq("semester", sem),
        supabase.from("course_structures")
          .select(`*, course_teachers(teacher_id)`)
          .eq("classroom_id", room).eq("academic_year", yr),
        supabase.from("teaching_assignments")
          .select("teacher_id, classroom_id, day_of_week, slot_id, subject_id, activity_type")
          .eq("academic_year", yr).eq("semester", sem)
      ]);
      if (assignRes.data) setScheduleData(assignRes.data as ScheduleItem[]);
      if (structRes.data) setCourseStructures(structRes.data);
      if (allRoomsRes.data) setAllRoomAssignments(allRoomsRes.data);
    } finally {
      setIsLoading(false);
    }
  }

  const handleEditClick = (item: ScheduleItem) => {
    setEditingId(item.id || null);
    setActiveSlot({ day: item.day_of_week, slotId: item.slot_id });
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

  // ── Heatmap: คำนวณสถานะทุก slot เมื่อ modal เปิดหรือ subject/teacher เปลี่ยน ──
  useEffect(() => {
    if (!isModalOpen || !formData.subject_id) {
      setSlotStatus({});
      return;
    }
    const subjectName = subjects.find(s => s.id === formData.subject_id)?.name || "";
    const teacherIds = formData.teacher_ids.filter(Boolean);
    const status: Record<string, "safe" | "warn" | "conflict"> = {};

    for (const day of days) {
      for (const slotId of realSlotIds) {
        const key = `${day}-${slotId}`;

        // ถ้าเป็น slot ที่กำลัง edit อยู่ → ข้ามไม่แสดงสี
        if (editingId && activeSlot?.day === day && activeSlot?.slotId === slotId) {
          continue;
        }

        // ถ้า slot นี้มี assignment อื่นในห้องนี้อยู่แล้ว (ไม่ใช่ที่กำลัง edit) → ไม่ highlight
        const roomAssigns = scheduleData.filter(a =>
          a.day_of_week === day && a.slot_id === slotId &&
          (editingId ? a.id !== editingId : true)
        );
        if (roomAssigns.length > 0) {
          // ถ้ามี locked → conflict เด็ดขาด, ถ้าไม่ล็อก → conflict ธรรมดา
          status[key] = "conflict"; continue;
        }

        // HARD: ครูคนใดคนนึงติดห้องอื่น (locked หรือไม่ก็ตาม → conflict)
        const teacherBusy = teacherIds.some(tid =>
          allRoomAssignments.some(r =>
            String(r.teacher_id) === String(tid) &&
            r.day_of_week === day && r.slot_id === slotId &&
            String(r.classroom_id) !== String(selectedRoom)
          )
        );
        if (teacherBusy) { status[key] = "conflict"; continue; }

        // SOFT: วิชานี้มีอยู่วันนี้แล้ว (subjectSameDay)
        const subjectSameDay = scheduleData.some(a =>
          a.day_of_week === day &&
          String(a.subject_id) === String(formData.subject_id) &&
          (editingId ? a.id !== editingId : true)
        );

        // SOFT: mathRule
        const slotsInDay = scheduleData
          .filter(a => a.day_of_week === day && (editingId ? a.id !== editingId : true))
          .map(a => ({ slot_id: a.slot_id, subjectName: a.subjects?.name || "" }));
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
      const slotsInDay = scheduleData
        .filter(a => a.day_of_week === activeSlot.day && a.id !== editingId)
        .map(a => ({ slot_id: a.slot_id, subjectName: a.subjects?.name || "" }));
      if (wouldViolateMathAdjacentRule(newSubjectName, activeSlot.slotId, slotsInDay)) {
        if (!confirm(`⚠️ คำเตือน: "${newSubjectName}" จะอยู่ติดกับวิชากลุ่มคณิตอีกวิชา\nต้องการลงต่อไปหรือไม่?`)) return;
      }
    }

    const isSlotChanging = !editingId ||
      scheduleData.find(a => a.id === editingId)?.slot_id !== activeSlot.slotId ||
      scheduleData.find(a => a.id === editingId)?.day_of_week !== activeSlot.day;

    if (isSlotChanging) {
      const { data: slotAssigns } = await supabase
        .from("teaching_assignments").select("teacher_id, classroom_id, activity_type, is_locked, subject_id")
        .eq("academic_year", termInfo.year).eq("semester", termInfo.semester)
        .eq("day_of_week", activeSlot.day).eq("slot_id", activeSlot.slotId)
        .neq("id", editingId ?? -1);

      // HARD BLOCK: ห้องนี้มี locked assignment อยู่แล้ว → ห้ามลงทับเด็ดขาด
      const lockedInRoom = (slotAssigns || []).filter(a =>
        String(a.classroom_id) === String(selectedRoom) && a.is_locked
      );
      if (lockedInRoom.length > 0) {
        const lockedSubject = subjects.find(s => String(s.id) === String(lockedInRoom[0].subject_id));
        alert(`🔒 ไม่สามารถลงคาบนี้ได้\n\nช่องนี้มีวิชา "${lockedSubject?.name || "ที่ล็อกแล้ว"}" ล็อกอยู่\nต้องปลดล็อกก่อนจึงจะแก้ไขได้`);
        return;
      }

      const warnings: string[] = [];
      const validTeacherIds = formData.teacher_ids.filter(id => id !== "");

      // ครูติดคาบ (warn ได้ แต่ถ้า locked → block)
      for (const tid of validTeacherIds) {
        const conflict = (slotAssigns || []).find(a => String(a.teacher_id) === String(tid));
        if (conflict) {
          const tName = teachers.find(t => t.id === tid)?.full_name || "ครูคนนี้";
          if (conflict.is_locked) {
            alert(`🔒 ไม่สามารถลงคาบนี้ได้\n\n"${tName}" มีคาบที่ล็อกแล้วในเวลานี้อยู่ที่ห้องอื่น`);
            return;
          }
          warnings.push(`👤 "${tName}" มีคาบสอนในเวลานี้อยู่แล้ว`);
        }
      }

      // ห้องมีวิชาอื่น (ไม่ล็อก → warn ได้)
      if ((slotAssigns || []).some(a => String(a.classroom_id) === String(selectedRoom))) {
        const rName = classrooms.find(r => r.id === selectedRoom)?.name || "ห้องนี้";
        warnings.push(`🏫 ห้อง "${rName}" มีวิชาสอนในคาบนี้อยู่แล้ว`);
      }

      if (warnings.length > 0) {
        if (!confirm(`⚠️ พบปัญหา ${warnings.length} รายการ:\n\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n\nต้องการลงต่อไปหรือไม่?`)) return;
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
      // ลบ extra rows เฉพาะที่ไม่ล็อก (ป้องกันลบ locked ของวิชาเดียวกันใน slot เดียวกัน)
      await supabase.from("teaching_assignments").delete()
        .eq("classroom_id", selectedRoom)
        .eq("day_of_week", activeSlot.day)
        .eq("slot_id", activeSlot.slotId)
        .eq("subject_id", formData.subject_id)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .eq("is_locked", false)
        .neq("id", editingId);
      const { error: e } = await supabase.from("teaching_assignments").update(basePayload).eq("id", editingId);
      error = e;
      if (!error && validTeacherIds.length > 1) {
        const { error: e2 } = await supabase.from("teaching_assignments").insert(validTeacherIds.slice(1).map(tid => ({ ...basePayload, teacher_id: tid })));
        error = e2;
      }
    } else {
      const { error: e } = await supabase.from("teaching_assignments").insert([basePayload]);
      error = e;
      if (!error && validTeacherIds.length > 1) {
        const { error: e2 } = await supabase.from("teaching_assignments").insert(validTeacherIds.slice(1).map(tid => ({ ...basePayload, teacher_id: tid })));
        error = e2;
      }
    }

    if (!error) { setIsModalOpen(false); setEditingId(null); await fetchSchedule(); }
    else alert("เกิดข้อผิดพลาด: " + error.message);
    setIsLoading(false);
  }

  const summaryList = Object.values(scheduleData.reduce((acc: any, item) => {
    const key = `${item.subject_id}-${item.teacher_id || 'null'}`;
    if (!acc[key]) acc[key] = { id: key, code: item.subjects?.code || "-", name: item.subjects?.name || "ไม่ระบุ", teacher: item.teachers?.full_name || "-", count: 0 };
    acc[key].count++;
    return acc;
  }, {})).sort((a: any, b: any) => a.code.localeCompare(b.code));

  const totalPeriods = (summaryList as any[]).reduce((sum, item) => sum + (item as any).count, 0);

  // ✅ FIX: String() comparison, ไม่มี !activity_type filter
  const structureSummary = courseStructures.length > 0
    ? courseStructures.map((s: any) => {
        const subjectInfo = subjects.find(sub => String(sub.id) === String(s.subject_id));
        const teacherId = s.course_teachers?.[0]?.teacher_id || null;
        const teacherInfo = teachers.find(t => String(t.id) === String(teacherId));
        const needed = s.periods_per_week || 1;
        const uniqueSlots = new Set(
          scheduleData
            .filter(a => String(a.subject_id) === String(s.subject_id))
            .map(a => `${a.day_of_week}-${a.slot_id}`)
        );
        const rawPlaced = uniqueSlots.size;
        const placed = Math.min(rawPlaced, needed);
        return { subject_id: s.subject_id, subject_code: subjectInfo?.code || "-", subject_name: subjectInfo?.name || String(s.subject_id), teacher_name: teacherInfo?.full_name || "-", needed, placed, rawPlaced };
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
        .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year);
      if (structError || !structures || structures.length === 0) {
        alert("⚠️ ไม่พบข้อมูลโครงสร้างรายวิชาของห้องนี้"); return;
      }

      // ── 2. ล้างตาราง (ถ้าเลือก reset) ──
      if (mode === 'reset') {
        await supabase.from("teaching_assignments").delete()
          .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year)
          .eq("semester", termInfo.semester).eq("is_locked", false);
      }

      // ── 3. โหลด existing assignments ──
      const [existingRes, allRoomsRes] = await Promise.all([
        supabase.from("teaching_assignments")
          .select("day_of_week, slot_id, teacher_id, subject_id, activity_type, is_locked")
          .eq("classroom_id", selectedRoom).eq("academic_year", termInfo.year).eq("semester", termInfo.semester),
        supabase.from("teaching_assignments")
          .select("day_of_week, slot_id, teacher_id, classroom_id, activity_type")
          .eq("academic_year", termInfo.year).eq("semester", termInfo.semester)
      ]);
      const existing = existingRes.data || [];
      const allRoomsExisting = allRoomsRes.data || [];

      // ── 4. สร้าง lookup sets ──
      const usedRoomSlots = new Set<string>(existing.map((r: any) => `${r.day_of_week}-${r.slot_id}`));
      const usedTeacherSlots = new Set<string>(
        allRoomsExisting.filter((r: any) => r.teacher_id)
          .map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`)
      );
      const usedSubjectDays = new Set<string>(existing.map((r: any) => `${r.subject_id}-${r.day_of_week}`));
      const usedClassroomSlots = new Set<string>([
        ...allRoomsExisting.filter((r: any) => String(r.classroom_id) !== String(selectedRoom))
          .map((r: any) => `${r.classroom_id}-${r.day_of_week}-${r.slot_id}`),
        ...existing.map((r: any) => `${selectedRoom}-${r.day_of_week}-${r.slot_id}`),
      ]);

      // นับ unique slot ของแต่ละวิชาที่มีอยู่แล้วใน existing
      // mode=reset  → existing มีแค่ locked (unlocked ถูกลบไปแล้ว) → นับถูกต้อง
      // mode=fill   → existing มีทั้ง locked+unlocked → นับรวม ป้องกันลงซ้ำ
      const existingSubjectSlots: Record<string, Set<string>> = {};
      for (const r of existing) {
        if (!(r as any).activity_type) {
          const k = String((r as any).subject_id);
          if (!existingSubjectSlots[k]) existingSubjectSlots[k] = new Set();
          existingSubjectSlots[k].add(`${(r as any).day_of_week}-${(r as any).slot_id}`);
        }
      }
      const existingSubjectCount: Record<string, number> = {};
      for (const [subId, slots] of Object.entries(existingSubjectSlots))
        existingSubjectCount[subId] = (slots as Set<string>).size;

      // ── 5. สร้าง jobs ──
      type Job = { subject_id: string; teacher_id: string | null; periods_needed: number; major_group: string; };
      const jobs: Job[] = structures.map((s: any) => ({
        subject_id: s.subject_id,
        teacher_id: s.course_teachers?.[0]?.teacher_id || null,
        periods_needed: Math.max(0, (s.periods_per_week || 1) - (existingSubjectCount[String(s.subject_id)] || 0)),
        major_group: s.major_group || "ทั้งหมด",
      })).filter((j: Job) => j.periods_needed > 0);

      // เรียง job: ครูที่ชน (busy) มากสุดก่อน → ได้ slot เลือกก่อน
      const teacherBusyCount: Record<string, number> = {};
      for (const key of usedTeacherSlots) {
        const tid = key.split("-")[0];
        teacherBusyCount[tid] = (teacherBusyCount[tid] || 0) + 1;
      }
      jobs.sort((a, b) => {
        const aB = a.teacher_id ? (teacherBusyCount[String(a.teacher_id)] || 0) : 0;
        const bB = b.teacher_id ? (teacherBusyCount[String(b.teacher_id)] || 0) : 0;
        if (aB !== bB) return bB - aB;           // ครูติดมากก่อน
        return b.periods_needed - a.periods_needed; // คาบเยอะก่อน
      });

      // ── 6. Helper: shuffle + spread ──
      const allSlotsBase = days.flatMap(d => realSlotIds.map(slotId => ({ day: d, slotId })));
      const shuffle = <T,>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const spreadSlots = (arr: typeof allSlotsBase) => {
        const byDay: Record<string, typeof allSlotsBase> = {};
        for (const s of arr) { if (!byDay[s.day]) byDay[s.day] = []; byDay[s.day].push(s); }
        const shuffledDays = shuffle(days.filter(d => byDay[d]?.length > 0));
        for (const d of shuffledDays) byDay[d] = shuffle(byDay[d]);
        const result: typeof allSlotsBase = [];
        const maxLen = Math.max(...shuffledDays.map(d => byDay[d].length));
        for (let i = 0; i < maxLen; i++)
          for (const d of shuffledDays) if (byDay[d][i]) result.push(byDay[d][i]);
        return result;
      };

      // ── 7. ฟังก์ชันจัดตาราง 1 รอบ ──
      // pass = 0 → strict (ทุก constraint), pass = 1 → relaxed (ข้าม subjectSameDay)
      // pass = 2 → most relaxed (ข้าม subjectSameDay + mathRule)
      // หมายเหตุ: รับ Set ปัจจุบันเข้ามาเพื่อ accumulate ต่อจาก pass ก่อน
      function runAssignment(
        jobList: Job[],
        initAvailable: typeof allSlotsBase,
        pass: number,
        initUsedRoomSlots: Set<string>,
        initUsedTeacherSlots: Set<string>,
        initUsedSubjectDays: Set<string>,
        initUsedClassroomSlots: Set<string>
      ): { toInsert: any[]; failLog: { subject_id: string; reasons: Record<string, number> }[];
           usedRoomSlots: Set<string>; usedTeacherSlots: Set<string>;
           usedSubjectDays: Set<string>; usedClassroomSlots: Set<string> } {
        const localUsedRoomSlots = new Set(initUsedRoomSlots);
        const localUsedTeacherSlots = new Set(initUsedTeacherSlots);
        const localUsedSubjectDays = new Set(initUsedSubjectDays);
        const localUsedClassroomSlots = new Set(initUsedClassroomSlots);

        const toInsert: any[] = [];
        const failLog: { subject_id: string; reasons: Record<string, number> }[] = [];
        let availableSlots = [...initAvailable];

        for (const job of jobList) {
          let placed = 0;
          const newAvailable: typeof allSlotsBase = [];
          const reasons: Record<string, number> = {
            teacherBusy: 0, subjectSameDay: 0, mathRule: 0, classroomConflict: 0
          };

          for (const slot of availableSlots) {
            if (placed >= job.periods_needed) { newAvailable.push(slot); continue; }

            // ① teacher conflict — HARD
            const teacherBusy = job.teacher_id
              ? localUsedTeacherSlots.has(`${job.teacher_id}-${slot.day}-${slot.slotId}`) ||
                toInsert.some(r => String(r.teacher_id) === String(job.teacher_id) &&
                  r.day_of_week === slot.day && r.slot_id === slot.slotId)
              : false;

            // ② classroom conflict — HARD
            const classroomConflict = localUsedClassroomSlots.has(`${selectedRoom}-${slot.day}-${slot.slotId}`);

            // ③ subjectSameDay — SOFT pass≥1 ข้ามได้
            const subjectSameDay = pass < 1
              ? (localUsedSubjectDays.has(`${job.subject_id}-${slot.day}`) ||
                 toInsert.some(r => String(r.subject_id) === String(job.subject_id) && r.day_of_week === slot.day))
              : false;

            // ④ mathRule — SOFT pass≥2 ข้ามได้
            const jobSubjectName = subjects.find(s => s.id === job.subject_id)?.name || "";
            const existingSlotsInDay = [
              ...existing.map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => s.id === r.subject_id)?.name || "" })),
              ...toInsert.filter((r: any) => r.day_of_week === slot.day).map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => s.id === r.subject_id)?.name || "" })),
            ].filter(r => r.slot_id !== slot.slotId);
            const violatesMathRule = pass < 2
              ? wouldViolateMathAdjacentRule(jobSubjectName, slot.slotId, existingSlotsInDay)
              : false;

            if (!teacherBusy && !classroomConflict && !subjectSameDay && !violatesMathRule) {
              toInsert.push({
                classroom_id: selectedRoom, subject_id: job.subject_id, teacher_id: job.teacher_id,
                day_of_week: slot.day, slot_id: slot.slotId, is_locked: false,
                major_group: job.major_group, academic_year: termInfo.year, semester: termInfo.semester
              });
              localUsedRoomSlots.add(`${slot.day}-${slot.slotId}`);
              localUsedSubjectDays.add(`${job.subject_id}-${slot.day}`);
              localUsedClassroomSlots.add(`${selectedRoom}-${slot.day}-${slot.slotId}`);
              if (job.teacher_id) localUsedTeacherSlots.add(`${job.teacher_id}-${slot.day}-${slot.slotId}`);
              placed++;
            } else {
              if (teacherBusy) reasons.teacherBusy++;
              if (subjectSameDay) reasons.subjectSameDay++;
              if (violatesMathRule) reasons.mathRule++;
              if (classroomConflict) reasons.classroomConflict++;
              newAvailable.push(slot);
            }
          }

          if (placed < job.periods_needed) failLog.push({ subject_id: job.subject_id, reasons });
          availableSlots = newAvailable;
        }

        return { toInsert, failLog,
          usedRoomSlots: localUsedRoomSlots, usedTeacherSlots: localUsedTeacherSlots,
          usedSubjectDays: localUsedSubjectDays, usedClassroomSlots: localUsedClassroomSlots };
      }

      // ── 8. รัน 3 รอบ: accumulate — pass ถัดไปจัดเฉพาะ jobs ที่ fail เท่านั้น ──
      let finalInsert: any[] = [];
      let finalFail: { subject_id: string; reasons: Record<string, number> }[] = [];

      // state สะสมข้ามรอบ
      let curUsedRoomSlots = new Set(usedRoomSlots);
      let curUsedTeacherSlots = new Set(usedTeacherSlots);
      let curUsedSubjectDays = new Set(usedSubjectDays);
      let curUsedClassroomSlots = new Set(usedClassroomSlots);
      let remainingJobs = [...jobs];

      const MAX_PASS = 3;
      for (let pass = 0; pass < MAX_PASS; pass++) {
        if (remainingJobs.length === 0) break;

        // shuffle slot ใหม่ทุก pass เพื่อกระจาย
        const availableSlots = spreadSlots(
          allSlotsBase.filter(s => !curUsedRoomSlots.has(`${s.day}-${s.slotId}`))
        );

        const result = runAssignment(
          remainingJobs, availableSlots, pass,
          curUsedRoomSlots, curUsedTeacherSlots, curUsedSubjectDays, curUsedClassroomSlots
        );

        // สะสมผลลัพธ์
        finalInsert.push(...result.toInsert);
        finalFail = result.failLog;

        // อัพเดท state สะสม
        curUsedRoomSlots = result.usedRoomSlots;
        curUsedTeacherSlots = result.usedTeacherSlots;
        curUsedSubjectDays = result.usedSubjectDays;
        curUsedClassroomSlots = result.usedClassroomSlots;

        if (result.failLog.length === 0) break;

        // pass ถัดไปจัดเฉพาะ jobs ที่ยังขาด
        remainingJobs = result.failLog.map(f => {
          const orig = jobs.find(j => String(j.subject_id) === String(f.subject_id));
          if (!orig) return null;
          // คำนวณ periods_needed ที่เหลือจริงๆ
          const alreadyPlaced = finalInsert.filter(r =>
            String(r.subject_id) === String(f.subject_id)
          ).length;
          const stillNeeded = orig.periods_needed - alreadyPlaced;
          return stillNeeded > 0 ? { ...orig, periods_needed: stillNeeded } : null;
        }).filter(Boolean) as Job[];
      }

            // ── 9. Insert ──
      if (finalInsert.length > 0) {
        const { error: insertErr } = await supabase.from("teaching_assignments").insert(finalInsert);
        if (insertErr) throw insertErr;
      }

      // ── 10. แจ้งผล ──
      // แสดง warning สำหรับวิชาที่ข้าม soft constraints
      const softWarnings: string[] = [];
      for (const item of finalInsert) {
        // ตรวจว่าวิชานี้ซ้ำวันไหม
        const otherSameSubjectSameDay = finalInsert.filter(r =>
          r !== item &&
          String(r.subject_id) === String(item.subject_id) &&
          r.day_of_week === item.day_of_week
        );
        if (otherSameSubjectSameDay.length > 0) {
          const subName = subjects.find(s => s.id === item.subject_id)?.name || item.subject_id;
          const subCode = subjects.find(s => s.id === item.subject_id)?.code || "";
          const key = `${item.subject_id}-${item.day_of_week}`;
          if (!softWarnings.includes(key)) {
            softWarnings.push(key);
          }
        }
      }

      if (finalFail.length > 0) {
        const lines = finalFail.map(f => {
          const subName = subjects.find(s => s.id === f.subject_id)?.name || f.subject_id;
          const subCode = subjects.find(s => s.id === f.subject_id)?.code || "";
          const r = f.reasons; const why: string[] = [];
          if (r.teacherBusy > 0) why.push(`ครูติดคาบอื่น ${r.teacherBusy} คาบ`);
          if (r.subjectSameDay > 0) why.push(`วิชาซ้ำวัน ${r.subjectSameDay} คาบ`);
          if (r.mathRule > 0) why.push(`กฎคณิตติดกัน ${r.mathRule} คาบ`);
          if (r.classroomConflict > 0) why.push(`ห้องมีครูอื่นสอนแล้ว ${r.classroomConflict} คาบ`);
          return `• ${subCode} ${subName}: ${why.join(", ") || "ไม่มีช่วงว่างพอ"}`;
        });
        let msg = `⚠️ จัดตารางไม่ครบ ${finalFail.length} วิชา:\n\n${lines.join("\n")}\n\n💡 แนะนำ: กด "จัดอัตโนมัติ" อีกครั้ง (slot จะ shuffle ใหม่)`;
        alert(msg);
      } else if (softWarnings.length > 0) {
        const warnSubjects = [...new Set(softWarnings.map(key => {
          const subId = key.split("-")[0];
          const sub = subjects.find(s => s.id === subId);
          return sub ? `${sub.code} ${sub.name}` : subId;
        }))];
        alert(`✅ จัดตารางครบแล้ว\n\n⚠️ หมายเหตุ: ${warnSubjects.length} วิชาถูกจัดซ้ำวัน (เนื่องจากไม่มี slot ว่างเพียงพอ):\n${warnSubjects.map(s => "• " + s).join("\n")}\n\nตรวจสอบและปรับได้ที่ตารางสอน`);
      } else {
        // success เงียบ — refresh อัตโนมัติก็พอ
      }
    } catch (err: any) { console.error(err); alert("เกิดข้อผิดพลาด: " + err.message); }
    finally { setIsLoading(false); await fetchSchedule(); }
  }



  async function handleAutoAssignAll() {
    const confirmed = confirm(
      "🌐 จัดตารางสอนทุกห้องพร้อมกัน\n\nระบบจะ:\n• โหลดโครงสร้างทุกห้องพร้อมกัน\n• แจกครูอย่างยุติธรรม (ไม่มีห้องไหนได้เปรียบ)\n• ล้างเฉพาะคาบที่ไม่ได้ล็อก\n\nใช้เวลาสักครู่ ต้องการดำเนินการหรือไม่?"
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      // ── 1. โหลดห้องเรียนทั้งหมด ──
      const { data: allClassrooms, error: clsErr } = await supabase
        .from("classrooms").select("id, name").order("name");
      if (clsErr || !allClassrooms?.length) {
        alert("⚠️ ไม่พบข้อมูลห้องเรียน"); return;
      }

      // ── 2. โหลด course_structures ทุกห้อง ──
      const { data: allStructures, error: strErr } = await supabase
        .from("course_structures")
        .select("*, course_teachers(teacher_id)")
        .eq("academic_year", termInfo.year);
      if (strErr || !allStructures?.length) {
        alert("⚠️ ไม่พบโครงสร้างรายวิชา"); return;
      }

      // ── 3. โหลด existing assignments ทั้งโรงเรียน ──
      const { data: existingAll, error: exErr } = await supabase
        .from("teaching_assignments")
        .select("id, classroom_id, day_of_week, slot_id, teacher_id, subject_id, activity_type, is_locked")
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);
      if (exErr) throw exErr;
      const existingAllData = existingAll || [];

      // ── 4. ลบ unlocked ทุกห้อง ──
      const { error: delErr } = await supabase
        .from("teaching_assignments")
        .delete()
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .eq("is_locked", false);
      if (delErr) throw delErr;

      // เก็บเฉพาะ locked ไว้คำนวณ conflict
      const lockedData = existingAllData.filter((r: any) => r.is_locked);

      // ── 5. สร้าง global usedTeacherSlots จาก locked ──
      const usedTeacherSlots = new Set<string>(
        lockedData.filter((r: any) => r.teacher_id)
          .map((r: any) => `${r.teacher_id}-${r.day_of_week}-${r.slot_id}`)
      );
      const usedClassroomSlots = new Set<string>(
        lockedData.map((r: any) => `${r.classroom_id}-${r.day_of_week}-${r.slot_id}`)
      );

      // ── 6. สร้าง jobs ต่อห้อง ──
      type Job = {
        classroom_id: string;
        subject_id: string;
        teacher_id: string | null;
        periods_needed: number;
        major_group: string;
      };

      const allJobs: Job[] = [];
      for (const cls of allClassrooms) {
        const clsStructures = allStructures.filter(
          (s: any) => String(s.classroom_id) === String(cls.id)
        );
        // locked ของห้องนี้
        const clsLocked = lockedData.filter((r: any) => String(r.classroom_id) === String(cls.id));
        const lockedSubjectSlots: Record<string, Set<string>> = {};
        for (const r of clsLocked) {
          if (!(r as any).activity_type) {
            const k = String((r as any).subject_id);
            if (!lockedSubjectSlots[k]) lockedSubjectSlots[k] = new Set();
            lockedSubjectSlots[k].add(`${(r as any).day_of_week}-${(r as any).slot_id}`);
          }
        }

        for (const s of clsStructures) {
          const placed = lockedSubjectSlots[String(s.subject_id)]?.size || 0;
          const needed = Math.max(0, (s.periods_per_week || 1) - placed);
          if (needed > 0) {
            allJobs.push({
              classroom_id: String(cls.id),
              subject_id: s.subject_id,
              teacher_id: s.course_teachers?.[0]?.teacher_id || null,
              periods_needed: needed,
              major_group: s.major_group || "ทั้งหมด",
            });
          }
        }
      }

      // ── 7. shuffle helper ──
      const shuffle = <T,>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };

      // ── 8. Interleave assignment ──
      // แทนที่จะจัดทีละห้อง ใช้ round-robin: แต่ละรอบหยิบ 1 คาบจากแต่ละห้อง สลับกัน
      // pass=0 strict, pass=1 ข้าม subjectSameDay, pass=2 ข้าม mathRule ด้วย
      const toInsertAll: any[] = [];
      // per-classroom state
      const clsUsedSubjectDays: Record<string, Set<string>> = {};
      const clsUsedSlots: Record<string, Set<string>> = {}; // classroom slots

      // init จาก locked
      for (const r of lockedData) {
        const clsId = String((r as any).classroom_id);
        if (!clsUsedSlots[clsId]) clsUsedSlots[clsId] = new Set();
        clsUsedSlots[clsId].add(`${(r as any).day_of_week}-${(r as any).slot_id}`);
        if (!clsUsedSubjectDays[clsId]) clsUsedSubjectDays[clsId] = new Set();
        if (!(r as any).activity_type) {
          clsUsedSubjectDays[clsId].add(`${(r as any).subject_id}-${(r as any).day_of_week}`);
        }
      }

      const allSlotsBase = days.flatMap(d => realSlotIds.map(slotId => ({ day: d, slotId })));

      // group jobs by classroom
      const jobsByRoom: Record<string, Job[]> = {};
      for (const j of allJobs) {
        if (!jobsByRoom[j.classroom_id]) jobsByRoom[j.classroom_id] = [];
        jobsByRoom[j.classroom_id].push(j);
      }

      // sort jobs per room: teacher busy → periods desc
      const teacherBusyCount: Record<string, number> = {};
      for (const key of usedTeacherSlots) {
        const tid = key.split("-")[0];
        teacherBusyCount[tid] = (teacherBusyCount[tid] || 0) + 1;
      }
      for (const clsId of Object.keys(jobsByRoom)) {
        jobsByRoom[clsId].sort((a, b) => {
          const aB = a.teacher_id ? (teacherBusyCount[String(a.teacher_id)] || 0) : 0;
          const bB = b.teacher_id ? (teacherBusyCount[String(b.teacher_id)] || 0) : 0;
          if (aB !== bB) return bB - aB;
          return b.periods_needed - a.periods_needed;
        });
      }

      const failLog: Record<string, { subjectId: string; classroomId: string; reasons: Record<string, number> }[]> = { "0": [], "1": [], "2": [] };

      // 3 passes
      for (let pass = 0; pass < 3; pass++) {
        // รวม jobs ที่ fail จากรอบก่อน (ถ้ามี)
        const pendingByRoom: Record<string, Job[]> = pass === 0
          ? { ...jobsByRoom }
          : {};

        if (pass > 0) {
          for (const f of (failLog[String(pass - 1)] || [])) {
            if (!pendingByRoom[f.classroomId]) pendingByRoom[f.classroomId] = [];
            const origJob = allJobs.find(j =>
              j.classroom_id === f.classroomId && String(j.subject_id) === String(f.subjectId)
            );
            if (origJob) {
              // คำนวณ periods_needed ที่เหลือจริงๆ
              const alreadyPlaced = toInsertAll.filter(r =>
                String(r.classroom_id) === f.classroomId &&
                String(r.subject_id) === f.subjectId
              ).length;
              const stillNeeded = origJob.periods_needed - alreadyPlaced;
              if (stillNeeded > 0) pendingByRoom[f.classroomId].push({ ...origJob, periods_needed: stillNeeded });
            }
          }
        }

        if (Object.keys(pendingByRoom).length === 0) break;

        // สร้าง available slots ต่อห้อง
        const availByRoom: Record<string, typeof allSlotsBase> = {};
        for (const clsId of Object.keys(pendingByRoom)) {
          const taken = clsUsedSlots[clsId] || new Set();
          const free = shuffle(allSlotsBase.filter(s => !taken.has(`${s.day}-${s.slotId}`)));
          // spread by day
          const byDay: Record<string, typeof allSlotsBase> = {};
          for (const s of free) { if (!byDay[s.day]) byDay[s.day] = []; byDay[s.day].push(s); }
          const spreadDays = shuffle(days.filter(d => byDay[d]?.length));
          const spread: typeof allSlotsBase = [];
          const maxLen = Math.max(...spreadDays.map(d => byDay[d].length));
          for (let i = 0; i < maxLen; i++)
            for (const d of spreadDays) if (byDay[d]?.[i]) spread.push(byDay[d][i]);
          availByRoom[clsId] = spread;
        }

        // interleave: แต่ละรอบหยิบ 1 คาบจากแต่ละห้อง
        let roomOrder = shuffle(Object.keys(pendingByRoom));
        // ไม่ใช้ index แบบ % เพราะวนกลับ job เดิม — ใช้ pointer ต่อ job แทน
        // roomJobPointer = index ของ job ปัจจุบันในห้องนั้น (ไม่ใช้ %)
        const roomJobPointer: Record<string, number> = {};
        const roomSlotPointer: Record<string, number> = {};
        for (const clsId of roomOrder) { roomJobPointer[clsId] = 0; roomSlotPointer[clsId] = 0; }

        let progress = true;
        while (progress) {
          progress = false;
          roomOrder = shuffle(roomOrder);

          for (const clsId of roomOrder) {
            const jobs = pendingByRoom[clsId];
            if (!jobs?.length) continue;

            // ข้าม job ที่ done แล้ว
            while (roomJobPointer[clsId] < jobs.length && jobs[roomJobPointer[clsId]].periods_needed <= 0) {
              roomJobPointer[clsId]++;
              roomSlotPointer[clsId] = 0;
            }
            // ถ้าหมดทุก job → ลบห้องออก
            if (roomJobPointer[clsId] >= jobs.length) {
              delete pendingByRoom[clsId];
              continue;
            }

            const job = jobs[roomJobPointer[clsId]];
            const avail = availByRoom[clsId];
            let placed = false;

            for (let si = roomSlotPointer[clsId]; si < avail.length; si++) {
              const slot = avail[si];

              // HARD: teacher conflict
              const teacherBusy = job.teacher_id
                ? usedTeacherSlots.has(`${job.teacher_id}-${slot.day}-${slot.slotId}`) ||
                  toInsertAll.some(r =>
                    String(r.teacher_id) === String(job.teacher_id) &&
                    r.day_of_week === slot.day && r.slot_id === slot.slotId)
                : false;

              // HARD: classroom conflict
              const clsConflict = (clsUsedSlots[clsId] || new Set()).has(`${slot.day}-${slot.slotId}`) ||
                toInsertAll.some(r =>
                  String(r.classroom_id) === clsId &&
                  r.day_of_week === slot.day && r.slot_id === slot.slotId);

              // SOFT pass>=1: subject same day
              const subjectSameDay = pass < 1
                ? ((clsUsedSubjectDays[clsId] || new Set()).has(`${job.subject_id}-${slot.day}`) ||
                   toInsertAll.some(r =>
                     String(r.classroom_id) === clsId &&
                     String(r.subject_id) === String(job.subject_id) &&
                     r.day_of_week === slot.day))
                : false;

              // SOFT pass>=2: math rule
              const jobSubjectName = subjects.find(s => s.id === job.subject_id)?.name || "";
              const slotsSoFar = toInsertAll
                .filter((r: any) => String(r.classroom_id) === clsId && r.day_of_week === slot.day)
                .map((r: any) => ({ slot_id: r.slot_id, subjectName: subjects.find(s => s.id === r.subject_id)?.name || "" }));
              const mathRule = pass < 2
                ? wouldViolateMathAdjacentRule(jobSubjectName, slot.slotId, slotsSoFar)
                : false;

              if (!teacherBusy && !clsConflict && !subjectSameDay && !mathRule) {
                toInsertAll.push({
                  classroom_id: clsId,
                  subject_id: job.subject_id,
                  teacher_id: job.teacher_id,
                  day_of_week: slot.day,
                  slot_id: slot.slotId,
                  is_locked: false,
                  major_group: job.major_group,
                  academic_year: termInfo.year,
                  semester: termInfo.semester,
                });
                usedTeacherSlots.add(`${job.teacher_id}-${slot.day}-${slot.slotId}`);
                if (!clsUsedSubjectDays[clsId]) clsUsedSubjectDays[clsId] = new Set();
                clsUsedSubjectDays[clsId].add(`${job.subject_id}-${slot.day}`);
                if (!clsUsedSlots[clsId]) clsUsedSlots[clsId] = new Set();
                clsUsedSlots[clsId].add(`${slot.day}-${slot.slotId}`);
                job.periods_needed--;
                roomSlotPointer[clsId] = si + 1;
                placed = true;
                progress = true;
                break;
              }
            }

            if (!placed) {
              // ย้ายไป job ถัดไป reset slot pointer
              roomJobPointer[clsId]++;
              roomSlotPointer[clsId] = 0;
              // ถ้าหมดทุก job แล้ว → ลบห้อง
              const remaining = jobs.filter(j => j.periods_needed > 0);
              if (remaining.length === 0) delete pendingByRoom[clsId];
            } else if (job.periods_needed <= 0) {
              // job นี้เสร็จ → ไป job ถัดไป
              roomJobPointer[clsId]++;
              roomSlotPointer[clsId] = 0;
            }
          }
        }

        // เก็บ fail log
        const stillFailing = [];
        for (const [clsId, jobs] of Object.entries(pendingByRoom)) {
          for (const j of jobs) {
            if (j.periods_needed > 0) {
              stillFailing.push({ subjectId: String(j.subject_id), classroomId: clsId, reasons: {} });
            }
          }
        }
        failLog[String(pass)] = stillFailing;
        if (stillFailing.length === 0) break;
      }

      // ── 9. Batch insert ──
      if (toInsertAll.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < toInsertAll.length; i += CHUNK) {
          const { error: insErr } = await supabase
            .from("teaching_assignments")
            .insert(toInsertAll.slice(i, i + CHUNK));
          if (insErr) throw insErr;
        }
      }

      // ── 10. สรุปผล ──
      const finalFail = failLog["2"] || failLog["1"] || failLog["0"] || [];
      const totalRooms = allClassrooms.length;
      const totalPlaced = toInsertAll.length;

      // soft warnings: วิชาที่ซ้ำวัน
      const softWarnSet = new Set<string>();
      for (const item of toInsertAll) {
        const others = toInsertAll.filter(r =>
          r !== item &&
          String(r.classroom_id) === String(item.classroom_id) &&
          String(r.subject_id) === String(item.subject_id) &&
          r.day_of_week === item.day_of_week
        );
        if (others.length > 0) {
          const cls = allClassrooms.find(c => String(c.id) === String(item.classroom_id));
          softWarnSet.add(`${cls?.name || item.classroom_id}: ${subjects.find(s => s.id === item.subject_id)?.name || item.subject_id}`);
        }
      }

      if (finalFail.length > 0) {
        const lines = finalFail.slice(0, 10).map(f => {
          const cls = allClassrooms.find(c => String(c.id) === f.classroomId);
          const sub = subjects.find(s => String(s.id) === f.subjectId);
          return `• ${cls?.name || f.classroomId}: ${sub?.name || f.subjectId}`;
        });
        const more = finalFail.length > 10 ? `\n... และอีก ${finalFail.length - 10} วิชา` : "";
        alert(`✅ จัดครบ ${totalPlaced} คาบ ใน ${totalRooms} ห้อง\n\n⚠️ ไม่สามารถจัด ${finalFail.length} วิชา:\n${lines.join("\n")}${more}\n\n💡 ลองกด "จัดทุกห้องพร้อมกัน" อีกครั้ง (slot จะ shuffle ใหม่)`);
      } else if (softWarnSet.size > 0) {
        const warnList = [...softWarnSet].slice(0, 8).map(s => "• " + s).join("\n");
        alert(`✅ จัดครบทุกห้อง ${totalPlaced} คาบ\n\n⚠️ หมายเหตุ: ${softWarnSet.size} วิชาถูกจัดซ้ำวัน (slot ไม่พอ):\n${warnList}\n\nตรวจสอบและปรับได้ที่ตาราง`);
      } else {
        alert(`✅ จัดตารางสอนครบทุกห้องเรียบร้อย!\n\n📊 สรุป: ${totalRooms} ห้อง | ${totalPlaced} คาบ`);
      }

    } catch (err: any) {
      console.error(err);
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setIsLoading(false);
      await fetchSchedule();
    }
  }

  
  async function handleSaveGlobalSubject() {
    const isFreeMode = fixedFormData.subject_id === '__free__';
    if (!isFreeMode && !fixedFormData.subject_id) return;
    let targetRooms = classrooms;
    if (fixedFormData.target_level !== 'all')
      targetRooms = classrooms.filter(r => r.name.trim().startsWith(fixedFormData.target_level) || r.name.trim().startsWith("ม." + fixedFormData.target_level));
    if (targetRooms.length === 0) return;
    setIsLoading(true);
    try {
      const targetRoomIds = targetRooms.map(r => r.id);
      await supabase.from("teaching_assignments").delete()
        .eq("academic_year", termInfo.year).eq("semester", termInfo.semester)
        .eq("day_of_week", fixedFormData.day_of_week).eq("slot_id", fixedFormData.slot_id)
        .in("classroom_id", targetRoomIds);
      if (!isFreeMode) {
        const { error } = await supabase.from("teaching_assignments").insert(
          targetRooms.map(room => ({ classroom_id: room.id, subject_id: fixedFormData.subject_id, teacher_id: fixedFormData.teacher_id || null, day_of_week: fixedFormData.day_of_week, slot_id: fixedFormData.slot_id, is_locked: true, major_group: fixedFormData.major_group || "ทั้งหมด", academic_year: termInfo.year, semester: termInfo.semester }))
        );
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

  async function clearSchedule(mode: "unlocked" | "all", scope: "room" | "all") {
    // double-confirm ถ้าจะล้างวิชาที่ล็อก
    if (mode === "all") {
      const scopeLabel = scope === "all" ? "ทุกห้องเรียน" : `ห้อง ${selectedRoomName}`;
      const confirmed = confirm(
        `⚠️ ยืนยันการล้างวิชาที่ล็อก\n\nคุณกำลังจะลบวิชาที่ล็อกทั้งหมดใน${scopeLabel}\nข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้\n\nกด OK เพื่อยืนยัน`
      );
      if (!confirmed) return;
    }
    setIsLoading(true);
    setShowClearModal(false);
    try {
      let query = supabase.from("teaching_assignments").delete()
        .eq("academic_year", termInfo.year).eq("semester", termInfo.semester);
      if (scope === "room") query = query.eq("classroom_id", selectedRoom);
      if (mode === "unlocked") query = query.eq("is_locked", false);
      await query;
      await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
    } finally {
      setIsLoading(false);
    }
  }

  const selectedRoomName = classrooms.find(c => String(c.id) === String(selectedRoom))?.name ?? selectedRoom;

  // วิชาที่ลงในตารางแต่ไม่อยู่ใน course_structures (ลงผิดวิชา)
  const structureSubjectIds = new Set((courseStructures || []).map((s: any) => String(s.subject_id)));
  const extraSubjects: { subject_id: string; subject_code: string; subject_name: string; teacher_name: string; count: number }[] = [];
  if (courseStructures.length > 0) {
    const extraMap: Record<string, { subject_id: string; subject_code: string; subject_name: string; teacher_name: string; slots: Set<string> }> = {};
    for (const a of scheduleData) {
      if (!a.activity_type && !structureSubjectIds.has(String(a.subject_id))) {
        const key = String(a.subject_id);
        if (!extraMap[key]) {
          extraMap[key] = {
            subject_id: key,
            subject_code: a.subjects?.code || "-",
            subject_name: a.subjects?.name || String(a.subject_id),
            teacher_name: a.teachers?.full_name || "-",
            slots: new Set(),
          };
        }
        extraMap[key].slots.add(`${a.day_of_week}-${a.slot_id}`);
      }
    }
    for (const v of Object.values(extraMap))
      extraSubjects.push({ ...v, count: v.slots.size });
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
            <select className="w-full p-2 border rounded-lg bg-slate-50 outline-none text-sm focus:ring-2 ring-indigo-500/20"
              value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
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

                        // Group วิชาเดียวกัน → card เดียว แสดงครูทุกคน
                        const grouped: { primary: ScheduleItem; teacherNames: string[] }[] = [];
                        for (const m of matches) {
                          const g = grouped.find(g => g.primary.subject_id === m.subject_id);
                          if (g) { if (m.teachers?.full_name) g.teacherNames.push(m.teachers.full_name); }
                          else grouped.push({ primary: m, teacherNames: m.teachers?.full_name ? [m.teachers.full_name] : [] });
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
                            {/* heatmap overlay — แสดงเฉพาะตอน modal เปิดและยังไม่มีวิชา */}
                            {isModalOpen && formData.subject_id && grouped.length === 0 && (() => {
                              const st = slotStatus[`${day}-${slot.id}`];
                              if (!st) return null;
                              const overlay =
                                st === "safe"     ? "bg-emerald-100 ring-2 ring-inset ring-emerald-400" :
                                st === "warn"     ? "bg-yellow-100 ring-2 ring-inset ring-yellow-400" :
                                st === "conflict" ? "bg-red-50 ring-1 ring-inset ring-red-300 opacity-60" : "";
                              const icon =
                                st === "safe"     ? <span className="text-emerald-500 text-base">✓</span> :
                                st === "warn"     ? <span className="text-yellow-500 text-base">⚠</span> :
                                st === "conflict" ? <span className="text-red-400 text-base">✕</span> : null;
                              return (
                                <div className={`absolute inset-0 rounded flex items-center justify-center transition-all pointer-events-none ${overlay}`}>
                                  {icon}
                                </div>
                              );
                            })()}
                            {grouped.length === 0 && (
                              <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition">
                                <span className="text-indigo-400 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded-full">+</span>
                              </div>
                            )}
                            {grouped.map(({ primary: m, teacherNames }) => (
                              <div key={m.id}
                                onClick={(e) => { e.stopPropagation(); handleEditClick(m); }}
                                className={`h-full flex flex-col p-2 rounded-lg border shadow-sm relative mb-0.5 cursor-pointer hover:scale-[1.02] transition-all overflow-hidden
                                  ${m.is_locked ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-300' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                                <button onClick={(e) => { e.stopPropagation(); matches.forEach(x => { if (x.id) handleDelete(x.id); }); }}
                                  className="absolute top-0.5 right-0.5 bg-red-100 text-red-600 rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-200 shadow-sm z-20 text-[10px] leading-none">×</button>
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
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    {structureSummary.some(i => i.placed < i.needed) ? '⚠️' : '✅'} สรุปสถานะรายวิชา
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    ลงแล้ว <span className="font-bold text-indigo-600">{structureSummary.reduce((s, i) => s + Math.min(i.placed, i.needed), 0)}</span> คาบ จากทั้งหมด <span className="font-bold">{structureSummary.reduce((s, i) => s + i.needed, 0)}</span> คาบ
                  </p>
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
                            <tr>{["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "ลงได้", "ขาด"].map(h => <th key={h} className="px-4 py-2 border-b border-red-200">{h}</th>)}</tr>
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
                            <tr>{["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "จำนวนคาบ"].map(h => <th key={h} className="px-4 py-2 border-b border-green-200">{h}</th>)}</tr>
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

                {/* ── วิชาที่ลงเกินจำนวน ── */}
                {structureSummary && structureSummary.filter(i => i.rawPlaced > i.needed).length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-orange-400 uppercase mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                      ลงเกินจำนวน ({structureSummary.filter(i => i.rawPlaced > i.needed).length} วิชา)
                    </div>
                    <div className="overflow-hidden rounded-lg border border-orange-200">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-orange-50 text-orange-600 text-xs font-semibold">
                          <tr>{["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "ลงได้/ควรมี", "เกิน"].map(h => <th key={h} className="px-4 py-2 border-b border-orange-200">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-orange-100 bg-white">
                          {structureSummary.filter(i => i.rawPlaced > i.needed).map((item, idx) => (
                            <tr key={`over-${item.subject_id}-${idx}`} className="hover:bg-orange-50">
                              <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                              <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                              <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                              <td className="px-4 py-2.5 text-center font-bold text-slate-600">{item.rawPlaced}/{item.needed}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-bold text-xs">+{item.rawPlaced - item.needed} คาบ</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── วิชาที่ลงแต่ไม่อยู่ใน course_structures ── */}
                {extraSubjects.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-orange-500 uppercase mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
                      ลงผิดวิชา / ไม่อยู่ในโครงสร้าง ({extraSubjects.length} วิชา)
                    </div>
                    <div className="overflow-hidden rounded-lg border border-orange-200">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-orange-100/60 text-orange-700 text-xs font-semibold">
                          <tr>{["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "จำนวนคาบ", ""].map(h => <th key={h} className="px-4 py-2 border-b border-orange-200">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-orange-100 bg-white">
                          {extraSubjects.map((item) => (
                            <tr key={item.subject_id} className="hover:bg-orange-50">
                              <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">{item.subject_code}</td>
                              <td className="px-4 py-2.5 font-semibold text-slate-700">{item.subject_name}</td>
                              <td className="px-4 py-2.5 text-slate-500 text-xs">{item.teacher_name}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold text-xs">{item.count} คาบ</span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="text-[10px] text-orange-500 font-semibold bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">⚠️ ไม่ตรงโครงสร้าง</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

      {/* ── Modal: ลงวิชาปกติ (Multi-teacher สูงสุด 4 คน) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px] flex items-center justify-center p-4">
          {/* legend แสดงมุมล่างซ้าย */}
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
              <h3 className="font-bold text-slate-800">
                {editingId ? '📝 แก้ไขข้อมูลคาบเรียน' : `ลงวิชาห้อง ${selectedRoomName}`}
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); setSubjectDropdownOpen(false); setSubjectSearch(""); setTeacherDropdownOpen(false); setTeacherSearch(""); }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="text-xs text-slate-500 font-bold uppercase">วัน{activeSlot?.day} คาบที่ {activeSlot?.slotId}</div>

              {/* ── วิชา ── */}
              <div className="relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">วิชา</label>
                <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                  onClick={() => setSubjectDropdownOpen(prev => !prev)}>
                  <span className={formData.subject_id ? "text-slate-800" : "text-slate-400"}>
                    {formData.subject_id
                      ? (() => { const s = subjects.find(s => s.id === formData.subject_id); return s ? `${s.code} - ${s.name}` : "-- เลือกวิชา --"; })()
                      : "-- เลือกวิชา --"}
                  </span>
                  <span className="text-slate-400 text-xs ml-2">{subjectDropdownOpen ? "▲" : "▼"}</span>
                </div>
                {subjectDropdownOpen && (
                  <div className="absolute z-[60] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
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
                      {subjectsForSelectedRoom
                        .filter(s => subjectSearch === "" || s.code.toLowerCase().includes(subjectSearch.toLowerCase()) || s.name.toLowerCase().includes(subjectSearch.toLowerCase()))
                        .map(s => (
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

              {/* ── ครูผู้สอน (Multi-teacher สูงสุด 4 คน) ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    ครูผู้สอน
                    <span className="ml-1.5 normal-case font-normal text-slate-300">({formData.teacher_ids.length}/{MAX_TEACHERS} คน)</span>
                  </label>
                  {formData.teacher_ids.length < MAX_TEACHERS && (
                    <button type="button"
                      onClick={() => setFormData(f => ({ ...f, teacher_ids: [...f.teacher_ids, ""] }))}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold px-2.5 py-1 rounded-lg hover:bg-indigo-50 border border-indigo-200 transition">
                      + เพิ่มครู
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {formData.teacher_ids.map((tid, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {/* Badge ลำดับ */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${TEACHER_BADGE_COLORS[idx % TEACHER_BADGE_COLORS.length].badge}`}>
                        {idx + 1}
                      </div>

                      {/* Dropdown ครู */}
                      <div className="relative flex-1">
                        <div className="w-full p-2.5 border rounded-xl bg-slate-50 cursor-pointer flex items-center justify-between text-sm"
                          onClick={() => { setTeacherDropdownOpen(teacherDropdownOpen === idx ? false : idx); setTeacherSearch(""); }}>
                          <span className={tid ? "text-slate-800" : "text-slate-400"}>
                            {tid ? teachers.find(t => t.id === tid)?.full_name || "-- เลือกครู --" : `-- ครูคนที่ ${idx + 1} --`}
                          </span>
                          <span className="text-slate-400 text-xs ml-2">{teacherDropdownOpen === idx ? "▲" : "▼"}</span>
                        </div>

                        {teacherDropdownOpen === idx && (
                          <div className="absolute z-[60] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                            <div className="p-2 border-b">
                              <input autoFocus
                                className="w-full px-3 py-1.5 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 ring-indigo-300"
                                placeholder="🔍 ค้นหาชื่อครู..."
                                value={teacherSearch}
                                onChange={e => setTeacherSearch(e.target.value)}
                                onClick={e => e.stopPropagation()} />
                            </div>
                            <div className="max-h-52 overflow-y-auto">
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
                                  !formData.teacher_ids.some((selId, i) => i !== idx && selId === t.id)
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

                      {/* ปุ่มลบ (ไม่ลบช่องแรก) */}
                      {idx > 0 && (
                        <button type="button"
                          onClick={() => setFormData(f => ({ ...f, teacher_ids: f.teacher_ids.filter((_, i) => i !== idx) }))}
                          className="w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center flex-shrink-0 transition text-sm border border-red-100">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {formData.teacher_ids.length < MAX_TEACHERS ? (
                  <p className="text-[10px] text-slate-400 mt-2">กด &quot;+ เพิ่มครู&quot; เพื่อเพิ่มได้อีก {MAX_TEACHERS - formData.teacher_ids.length} คน (สูงสุด {MAX_TEACHERS} คน)</p>
                ) : (
                  <p className="text-[10px] text-indigo-400 mt-2 font-semibold">ครบ {MAX_TEACHERS} คนแล้ว (สูงสุด)</p>
                )}
              </div>

              {/* ── กลุ่มเรียน + ล็อก ── */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">กลุ่มเรียน</label>
                  <input className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none text-sm"
                    placeholder="เช่น ทั้งหมด, กลุ่ม A, ..."
                    value={formData.major_group}
                    onChange={e => setFormData({ ...formData, major_group: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-indigo-600"
                    checked={formData.is_locked}
                    onChange={e => setFormData({ ...formData, is_locked: e.target.checked })} />
                  <span className="text-slate-600 font-medium">🔒 ล็อกคาบนี้</span>
                </label>
              </div>

              {/* ── ลงทุกวัน ── */}
              <div className="pt-1 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 mb-2 font-semibold uppercase">ลงคาบว่างพร้อมกันทุกวัน</p>
                <button
                  onClick={async () => {
                    if (!activeSlot || !selectedRoom) return;
                    setIsLoading(true);
                    const toInsert = days
                      .filter(d => !scheduleData.some(a => a.day_of_week === d && a.slot_id === activeSlot.slotId))
                      .map(d => ({
                        classroom_id: selectedRoom, subject_id: formData.subject_id || null,
                        teacher_id: formData.teacher_ids[0] || null, day_of_week: d,
                        slot_id: activeSlot.slotId, is_locked: formData.is_locked,
                        major_group: formData.major_group || "ทั้งหมด",
                        academic_year: termInfo.year, semester: termInfo.semester,
                      }));
                    if (toInsert.length > 0) await supabase.from("teaching_assignments").insert(toInsert);
                    setIsModalOpen(false); setEditingId(null);
                    await fetchSchedule(selectedRoom, termInfo.year, termInfo.semester);
                    setIsLoading(false);
                  }}
                  className="w-full py-2.5 bg-slate-700 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition">
                  📅 ลงคาบ {activeSlot?.slotId} ทุกวัน (เฉพาะช่องว่าง)
                </button>
              </div>

              <button onClick={handleSave}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm">
                {editingId ? '💾 บันทึกการแก้ไข' : '➕ เพิ่มคาบเรียน'}
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
              <p className="text-sm text-slate-500 mt-1">{clearScope === "room" ? `ห้อง ${selectedRoomName}` : "ทุกห้องเรียน"}</p>
            </div>

            {/* scope selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ขอบเขต</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "room", icon: "🏫", label: "ห้องนี้เท่านั้น" },
                  { value: "all",  icon: "🌐", label: "ทุกห้องพร้อมกัน" },
                ].map(s => (
                  <div key={s.value} onClick={() => setClearScope(s.value as any)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition text-center ${clearScope === s.value ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="text-xl mb-1">{s.icon}</div>
                    <div className={`text-xs font-bold ${clearScope === s.value ? "text-indigo-700" : "text-slate-600"}`}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* mode selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">วิธีล้าง</p>
              <div className="space-y-2">
                {[
                  { value: "unlocked", icon: "🔓", label: "ล้างเฉพาะที่ไม่ได้ล็อก", desc: "วิชาที่ล็อก 🔒 จะยังคงอยู่", color: "amber" },
                  { value: "all",      icon: "💣", label: "ล้างทั้งหมด",             desc: "รวมวิชาที่ล็อกไว้ด้วย ไม่สามารถกู้คืนได้", color: "red" },
                ].map(m => (
                  <div key={m.value} onClick={() => setClearMode(m.value as any)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition ${clearMode === m.value ? `border-${m.color}-400 bg-${m.color}-50` : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{m.icon}</span>
                      <div>
                        <div className={`font-bold text-sm ${m.value === "all" ? "text-red-700" : "text-slate-800"}`}>{m.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* warning banner เมื่อเลือก all+all */}
            {clearMode === "all" && clearScope === "all" && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <span className="text-red-500 text-lg mt-0.5">⚠️</span>
                <p className="text-xs text-red-700 font-medium">จะลบวิชาที่ล็อกทุกห้อง — ระบบจะขอยืนยันอีกครั้งก่อนดำเนินการ</p>
              </div>
            )}
            {clearMode === "all" && clearScope === "room" && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3">
                <span className="text-orange-500 text-lg mt-0.5">⚠️</span>
                <p className="text-xs text-orange-700 font-medium">จะลบวิชาที่ล็อกในห้องนี้ด้วย — ระบบจะขอยืนยันอีกครั้ง</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowClearModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => clearSchedule(clearMode, clearScope)}
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