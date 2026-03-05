"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

interface Session { id: string; full_name: string; email: string; role: string; }
interface Assignment {
  id: number; day_of_week: string; slot_id: number;
  classroom_id: string; subject_id: string; teacher_id: string;
  academic_year: string; semester: string; is_locked: boolean;
  subjects?: { code: string; name: string };
  classrooms?: { name: string };
  teachers?: { full_name: string };
}
interface SwapCandidate {
  assignment: Assignment;
  reason: string; // "ว่างทั้งคู่ 100%"
}
interface SwapHistory {
  id: number; created_at: string;
  requester_name: string;
  from_day: string; from_slot_id: number; from_classroom_name: string; from_subject_name: string;
  to_day: string; to_slot_id: number; to_classroom_name: string; to_subject_name: string;
  to_teacher_name: string;
  academic_year: string; semester: string;
}

const DAYS = ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์"];
const SLOT_LABELS: Record<number,string> = {1:"08:30-09:20",2:"09:20-10:10",3:"10:25-11:15",4:"11:15-12:05",5:"13:00-13:50",6:"14:00-14:50",7:"14:50-15:40"};


// --- Fuzzy grouping ---
function strSimilarity(a: string, b: string): number {
  a = a.trim().toLowerCase(); b = b.trim().toLowerCase();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({length: m+1}, (_,i) => Array.from({length: n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return 1 - dp[m][n] / Math.max(m, n);
}
function fuzzyGroupTeachers(teachers: {id:string,full_name:string,department?:string}[], threshold=0.8) {
  const canonicals: string[] = [];
  const groups: Record<string, typeof teachers> = {};
  for (const t of teachers) {
    const dept = t.department?.trim() || "ไม่ระบุกลุ่มสาระ";
    let matched = canonicals.find(c => strSimilarity(c, dept) >= threshold);
    if (!matched) { matched = dept; canonicals.push(dept); groups[dept] = []; }
    groups[matched].push(t);
  }
  return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b,'th'));
}

export default function SwapPeriods() {
  const [session, setSession] = useState<Session | null>(null);
  const [termInfo, setTermInfo] = useState({ year: "2569", semester: "3" });

  // ตารางสอนของครูที่ login
  const [myPeriods, setMyPeriods] = useState<Assignment[]>([]);
  // คาบที่เลือกจะแลก
  const [selectedPeriod, setSelectedPeriod] = useState<Assignment | null>(null);
  // ตารางสอนทั้งหมดในระบบ (ห้องเดียวกัน)
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);
  // รายการคาบที่แลกได้
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  // คาบที่เลือกจะแลกด้วย
  const [targetPeriod, setTargetPeriod] = useState<Assignment | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState<"swap" | "history">("swap");
  const [history, setHistory] = useState<SwapHistory[]>([]);
  const [allTeachers, setAllTeachers] = useState<{id:string,full_name:string,department?:string}[]>([]);
  const [myTeacherId, setMyTeacherId] = useState<string>(""); // ครู A (ผู้แลกออก)
  const [viewTeacherId, setViewTeacherId] = useState<string>(""); // ครู B (ผู้รับแลก)
  const [myTeacherPeriods, setMyTeacherPeriods] = useState<Assignment[]>([]); // คาบของครู A
  const [sameRoomTeachers, setSameRoomTeachers] = useState<{id:string,full_name:string,department?:string}[]>([]);
  const [viewPeriods, setViewPeriods] = useState<Assignment[]>([]); // คาบของครู B

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // โหลด session + settings
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("teacher_session") : null;
    if (saved) setSession(JSON.parse(saved));

    supabase.from("academic_settings").select("*").eq("id",1).single().then(({ data }) => {
      if (data) setTermInfo({ year: String(data.year), semester: String(data.semester) });
    });
  }, []);

  // โหลดคาบสอนของตัวเอง
  useEffect(() => {
    if (!session) return;
    loadMyPeriods();
  }, [session, termInfo]);

  async function loadMyPeriods() {
    if (!session) return;
    setIsLoading(true);
    const [{ data }, { data: tchs }] = await Promise.all([
      supabase
        .from("teaching_assignments")
        .select(`*, subjects(code,name), classrooms(name), teachers(full_name)`)
        .eq("teacher_id", session.id)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .order("day_of_week").order("slot_id"),
      supabase
        .from("teachers")
        .select("id, full_name, department")
        .order("department").order("full_name"),
    ]);
    if (data) setMyPeriods(data as Assignment[]);
    if (tchs) setAllTeachers(tchs);
    setIsLoading(false);
  }

  async function loadTeacherPeriods(teacherId: string) {
    if (!teacherId) { setViewPeriods([]); return; }
    setIsLoading(true);
    const { data } = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(code,name), classrooms(name), teachers(full_name)`)
      .eq("teacher_id", teacherId)
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester)
      .order("day_of_week").order("slot_id");
    if (data) setViewPeriods(data as Assignment[]);
    setIsLoading(false);
  }

  async function loadTeacherAperiods(teacherId: string) {
    if (!teacherId) { setMyTeacherPeriods([]); setSameRoomTeachers([]); return; }
    setIsLoading(true);

    const { data } = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(code,name), classrooms(name), teachers(full_name)`)
      .eq("teacher_id", teacherId)
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester)
      .order("day_of_week").order("slot_id");

    if (data) {
      setMyTeacherPeriods(data as Assignment[]);

      // หาห้องที่ครู A สอน
      const classroomIds = [...new Set(data.map((a: any) => a.classroom_id).filter(Boolean))];

      if (classroomIds.length > 0) {
        // หาครูทุกคนที่สอนในห้องเดียวกัน (ยกเว้นครู A เอง)
        const { data: sameRoom } = await supabase
          .from("teaching_assignments")
          .select("teacher_id, teachers(id, full_name, department)")
          .in("classroom_id", classroomIds)
          .eq("academic_year", termInfo.year)
          .eq("semester", termInfo.semester)
          .neq("teacher_id", teacherId);

        if (sameRoom) {
          // dedup by teacher_id
          const seen = new Set<string>();
          const uniq = sameRoom
            .filter((r: any) => r.teacher_id && !seen.has(r.teacher_id) && seen.add(r.teacher_id))
            .map((r: any) => ({
              id: r.teachers?.id || r.teacher_id,
              full_name: r.teachers?.full_name || "-",
              department: r.teachers?.department || "",
            }))
            .sort((a: any, b: any) => (a.department||"").localeCompare(b.department||"", "th") || a.full_name.localeCompare(b.full_name, "th"));
          setSameRoomTeachers(uniq);
        }
      } else {
        setSameRoomTeachers([]);
      }
    }
    setIsLoading(false);
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("swap_history")
      .select("*")
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data as SwapHistory[]);
  }

  // เมื่อเลือกคาบที่อยากแลก → หาคู่แลกที่เหมาะสม
  async function findCandidates(period: Assignment) {
    setSelectedPeriod(period);
    setTargetPeriod(null);
    setCandidates([]);
    setIsLoading(true);

    try {
      // 1. โหลดทุกคาบในห้องเดียวกัน (ยกเว้นคาบของตัวเอง)
      const { data: sameRoom } = await supabase
        .from("teaching_assignments")
        .select(`*, subjects(code,name), classrooms(name), teachers(full_name)`)
        .eq("classroom_id", period.classroom_id)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester)
        .neq("id", period.id);

      if (!sameRoom || sameRoom.length === 0) {
        showToast("ไม่พบคาบอื่นในห้องเดียวกัน", "error");
        setIsLoading(false);
        return;
      }

      // 2. โหลดตารางสอนทั้งหมดของครู A (ตัวเอง) ในเทอมนี้
      const { data: myAll } = await supabase
        .from("teaching_assignments")
        .select("day_of_week, slot_id")
        .eq("teacher_id", session!.id)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);

      const myBusySlots = new Set((myAll||[]).map((a:any) => `${a.day_of_week}-${a.slot_id}`));

      // 3. สำหรับแต่ละคาบผู้สมัคร ตรวจว่าแลกได้หรือเปล่า
      const result: SwapCandidate[] = [];

      for (const candidate of sameRoom as Assignment[]) {
        if (!candidate.teacher_id) continue; // คาบที่ไม่มีครูข้าม
        if (candidate.teacher_id === session!.id) continue; // ครูคนเดียวกัน ข้าม
        if (candidate.is_locked) continue; // คาบล็อก ข้าม

        // โหลดตารางของครู B (candidate teacher)
        const { data: teacherBSchedule } = await supabase
          .from("teaching_assignments")
          .select("day_of_week, slot_id")
          .eq("teacher_id", candidate.teacher_id)
          .eq("academic_year", termInfo.year)
          .eq("semester", termInfo.semester);

        const teacherBBusy = new Set((teacherBSchedule||[]).map((a:any) => `${a.day_of_week}-${a.slot_id}`));

        // เงื่อนไข: 
        // - ครู A ต้องว่างในคาบของ B (ยกเว้นคาบของตัวเองที่จะแลก)
        // - ครู B ต้องว่างในคาบของ A (ยกเว้นคาบของ B เองที่จะแลก)
        const mySlotKey = `${period.day_of_week}-${period.slot_id}`;
        const candidateSlotKey = `${candidate.day_of_week}-${candidate.slot_id}`;

        const myBusyWithoutOwn = new Set([...myBusySlots].filter(k => k !== mySlotKey));
        const teacherBBusyWithoutOwn = new Set([...teacherBBusy].filter(k => k !== candidateSlotKey));

        const aFreeInBSlot = !myBusyWithoutOwn.has(candidateSlotKey);
        const bFreeInASlot = !teacherBBusyWithoutOwn.has(mySlotKey);

        if (aFreeInBSlot && bFreeInASlot) {
          result.push({ assignment: candidate, reason: "✅ แลกได้ 100% ไม่ชนทั้งสองฝ่าย" });
        }
      }

      setCandidates(result);
      if (result.length === 0) showToast("ไม่มีคาบที่แลกได้โดยไม่ชน กรุณาเลือกคาบอื่น", "error");
    } catch (err: any) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmSwap() {
    if (!selectedPeriod || !targetPeriod || !session) return;
    setIsLoading(true);
    setConfirmOpen(false);

    try {
      // Swap: สลับ teacher_id ระหว่างสองคาบ
      const teacherA = myTeacherId; // ครู A
      const teacherB = viewTeacherId; // ครู B

      const [r1, r2] = await Promise.all([
        supabase.from("teaching_assignments").update({ teacher_id: teacherB }).eq("id", selectedPeriod.id),
        supabase.from("teaching_assignments").update({ teacher_id: teacherA }).eq("id", targetPeriod.id),
      ]);

      if (r1.error || r2.error) throw r1.error || r2.error;

      // บันทึกประวัติ
      await supabase.from("swap_history").insert([{
        requester_id: session.id,
        requester_name: session.full_name,
        from_day: selectedPeriod.day_of_week,
        from_slot_id: selectedPeriod.slot_id,
        from_classroom_id: selectedPeriod.classroom_id,
        from_classroom_name: selectedPeriod.classrooms?.name || "-",
        from_subject_id: selectedPeriod.subject_id,
        from_subject_name: selectedPeriod.subjects?.name || "-",
        to_day: targetPeriod.day_of_week,
        to_slot_id: targetPeriod.slot_id,
        to_classroom_id: targetPeriod.classroom_id,
        to_classroom_name: targetPeriod.classrooms?.name || "-",
        to_subject_id: targetPeriod.subject_id,
        to_subject_name: targetPeriod.subjects?.name || "-",
        to_teacher_id: teacherB,
        to_teacher_name: targetPeriod.teachers?.full_name || "-",
        academic_year: termInfo.year,
        semester: termInfo.semester,
      }]);

      showToast("✅ สลับคาบสำเร็จ!");
      setSelectedPeriod(null);
      setTargetPeriod(null);
      setCandidates([]);
      await loadMyPeriods();
    } catch (err: any) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error");
    } finally {
      setIsLoading(false);
    }
  }

  const fuzzyGrouped = useMemo(() => fuzzyGroupTeachers(allTeachers, 0.8), [allTeachers]);

  const groupedMyPeriods = useMemo(() => {
    const g: Record<string, Assignment[]> = {};
    for (const d of DAYS) g[d] = myPeriods.filter(p => p.day_of_week === d).sort((a,b) => a.slot_id - b.slot_id);
    return g;
  }, [myPeriods]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-slate-600 mb-4">กรุณา login ก่อนใช้งาน</p>
          <Link href="/" className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700">ไปหน้า Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmOpen && selectedPeriod && targetPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border p-6 space-y-5">
            <h3 className="text-lg font-bold text-slate-800 text-center">🔄 ยืนยันการสลับคาบ</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-400 font-bold uppercase mb-1">คาบของคุณ</div>
                <div className="font-bold text-blue-800 text-sm">{selectedPeriod.day_of_week} คาบ {selectedPeriod.slot_id}</div>
                <div className="text-xs text-blue-600 mt-1">{selectedPeriod.subjects?.name}</div>
                <div className="text-xs text-blue-400">ห้อง {selectedPeriod.classrooms?.name}</div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                <div className="text-xs text-indigo-400 font-bold uppercase mb-1">คาบที่แลก</div>
                <div className="font-bold text-indigo-800 text-sm">{targetPeriod.day_of_week} คาบ {targetPeriod.slot_id}</div>
                <div className="text-xs text-indigo-600 mt-1">{targetPeriod.subjects?.name}</div>
                <div className="text-xs text-indigo-400">ครู {targetPeriod.teachers?.full_name}</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              ⚠️ การสลับจะสลับเฉพาะ <strong>ครูผู้สอน</strong> วิชาและห้องยังคงเดิม และบันทึกประวัติไว้ในระบบ
            </div>

            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={confirmSwap} disabled={isLoading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                {isLoading ? "กำลังดำเนินการ..." : "✅ ยืนยันสลับเลย"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🔄 ระบบแลกคาบสอน</h1>
            <p className="text-slate-500 text-sm mt-0.5">สวัสดี <span className="font-semibold text-indigo-600">{session.full_name}</span> · ปี {termInfo.year} เทอม {termInfo.semester}</p>
          </div>
          <Link href="/" className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 shadow-sm">⬅ กลับ</Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {([["swap","🔄 แลกคาบ"],["history","📋 ประวัติ"]] as const).map(([v,l]) => (
            <button key={v} onClick={() => { setTab(v); if(v==="history") loadHistory(); }}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition ${tab===v?"bg-indigo-600 text-white shadow":"text-slate-500 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "swap" && (
          <div className="space-y-5">
            {/* Step 1: เลือกคาบของตัวเอง */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                <div className="flex-1">
                  <h2 className="font-bold text-slate-800">เลือกคาบที่ต้องการแลก</h2>
                  <p className="text-xs text-slate-400 mt-0.5">เลือกดูตารางสอนของครูคนใดก็ได้</p>
                </div>
              </div>
              {/* Picker ครู A และ ครู B */}
              <div className="px-5 pt-4 pb-4 border-b border-slate-100 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* ครู A */}
                  <div>
                    <label className="text-xs font-bold text-indigo-600 uppercase block mb-1.5">
                      👤 ครู A — ที่ต้องการแลกคาบออก
                    </label>
                    <select
                      className="w-full p-2.5 border-2 border-indigo-200 rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 ring-indigo-300 font-medium"
                      value={myTeacherId}
                      onChange={e => {
                        setMyTeacherId(e.target.value);
                        setSelectedPeriod(null); setCandidates([]); setTargetPeriod(null);
                        loadTeacherAperiods(e.target.value);
                      }}>
                      <option value="">-- เลือกครู A --</option>
                      {fuzzyGrouped.map(([dept, list]) => (
                        <optgroup key={dept} label={`📂 ${dept}`}>
                          {list.map(t => (
                            <option key={t.id} value={t.id}>{t.full_name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {/* ครู B */}
                  <div>
                    <label className="text-xs font-bold text-violet-600 uppercase block mb-1.5">
                      👤 ครู B — ที่จะรับคาบแทน
                      {myTeacherId && sameRoomTeachers.length > 0 && (
                        <span className="ml-2 font-normal text-violet-400 normal-case">
                          (เฉพาะครูที่สอนห้องเดียวกัน {sameRoomTeachers.length} คน)
                        </span>
                      )}
                    </label>
                    <select
                      className="w-full p-2.5 border-2 border-violet-200 rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 ring-violet-300 font-medium"
                      value={viewTeacherId}
                      onChange={e => {
                        setViewTeacherId(e.target.value);
                        setSelectedPeriod(null); setCandidates([]); setTargetPeriod(null);
                        loadTeacherPeriods(e.target.value);
                      }}>
                      <option value="">-- เลือกครู B --</option>
                      {(myTeacherId && sameRoomTeachers.length > 0 ? (
                        // แสดงเฉพาะครูที่สอนห้องเดียวกัน จัดกลุ่มด้วย fuzzy
                        fuzzyGroupTeachers(sameRoomTeachers, 0.8).map(([dept, list]) => (
                          <optgroup key={dept} label={`📂 ${dept}`}>
                            {list.map(t => (
                              <option key={t.id} value={t.id}>{t.full_name}</option>
                            ))}
                          </optgroup>
                        ))
                      ) : (
                        // fallback: แสดงทุกคน
                        fuzzyGrouped.map(([dept, list]) => (
                          <optgroup key={dept} label={`📂 ${dept}`}>
                            {list.filter(t => t.id !== myTeacherId).map(t => (
                              <option key={t.id} value={t.id}>{t.full_name}</option>
                            ))}
                          </optgroup>
                        ))
                      ))}
                    </select>
                  </div>
                </div>
                {myTeacherId && viewTeacherId && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-xs text-indigo-700 flex items-center gap-2">
                    <span>✅</span>
                    <span>เลือกครูครบแล้ว — กดที่คาบในตารางด้านล่างเพื่อเริ่มหาคาบที่แลกได้</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                {(() => {
                  if (isLoading) return <div className="py-8 text-center text-slate-400 text-sm">⏳ กำลังโหลด...</div>;
                  if (!myTeacherId || !viewTeacherId) return (
                    <div className="py-8 text-center text-slate-400 text-sm">เลือกครู A และครู B ด้านบนก่อน</div>
                  );
                  if (myTeacherPeriods.length === 0) return <div className="py-8 text-center text-slate-400 text-sm">ครู A ไม่มีคาบสอนในเทอมนี้</div>;
                  const grouped: Record<string,Assignment[]> = {};
                  for (const d of DAYS) grouped[d] = myTeacherPeriods.filter(p => p.day_of_week === d).sort((a,b) => a.slot_id - b.slot_id);
                  return (
                    <div className="space-y-2">
                      <div className="text-xs text-indigo-600 font-bold px-1 mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        คาบสอนของ {allTeachers.find(t=>t.id===myTeacherId)?.full_name}
                        <span className="font-normal text-slate-400 ml-1">— กดคาบที่ต้องการแลกออก</span>
                      </div>
                      {DAYS.map(day => grouped[day].length > 0 && (
                        <div key={day}>
                          <div className="text-xs font-bold text-slate-400 uppercase mb-1.5 px-1">{day}</div>
                          <div className="flex flex-wrap gap-2">
                            {grouped[day].map(p => (
                              <button key={p.id}
                                onClick={() => findCandidates(p)}
                                className={`flex flex-col items-start px-3 py-2 rounded-xl border-2 text-left transition text-sm
                                  ${selectedPeriod?.id === p.id
                                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                                    : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"}`}>
                                <span className="font-bold text-slate-700">คาบ {p.slot_id} <span className="font-normal text-slate-400 text-xs">({SLOT_LABELS[p.slot_id]})</span></span>
                                <span className="text-xs text-indigo-600 font-medium mt-0.5">{p.subjects?.code} {p.subjects?.name}</span>
                                <span className="text-xs text-slate-400">ห้อง {p.classrooms?.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Comparison Timetable: ตารางสอนเปรียบเทียบ 2 ครู แบบ visual */}
            {myTeacherId && viewTeacherId && viewTeacherId !== "pick" && (myTeacherPeriods.length > 0 || viewPeriods.length > 0) && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-800 mb-2">📊 ตารางสอนเปรียบเทียบ</h2>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-indigo-100 border border-indigo-300 inline-block"></span><span className="font-medium text-indigo-700">{session?.full_name}</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-violet-100 border border-violet-300 inline-block"></span><span className="font-medium text-violet-700">{allTeachers.find(t=>t.id===viewTeacherId)?.full_name}</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-100 border border-slate-200 inline-block"></span><span className="text-slate-400">ติดสอนทั้งคู่</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300 inline-block"></span><span className="text-emerald-600 font-medium">ว่างทั้งคู่ — แลกได้</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-100 border border-amber-300 inline-block"></span><span className="text-amber-600 font-medium">คาบที่ระบบแนะนำ</span></span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="border-collapse" style={{minWidth:'700px', width:'100%', tableLayout:'fixed'}}>
                    <colgroup>
                      <col style={{width:'60px'}}/>
                      {[1,2,3,4,5,6,7].map(s => <col key={s} style={{width:'calc((100% - 60px) / 7)'}}/>)}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        <th className="p-2 border-r text-slate-400 text-xs font-medium text-center">วัน</th>
                        {[1,2,3,4,5,6,7].map(s => (
                          <th key={s} className="p-1.5 border-r last:border-0 text-center">
                            <div className="text-[11px] font-bold text-slate-600">คาบ {s}</div>
                            <div className="text-[9px] text-slate-400 font-normal leading-tight">{SLOT_LABELS[s]}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map(day => (
                        <tr key={day} className="border-b last:border-0">
                          <td className="p-2 border-r bg-slate-50 font-bold text-center text-slate-600 text-xs">{day}</td>
                          {[1,2,3,4,5,6,7].map(slotId => {
                            const myP = myTeacherPeriods.find(p => p.day_of_week===day && p.slot_id===slotId);
                            const otherP = viewPeriods.find(p => p.day_of_week===day && p.slot_id===slotId);
                            const bothFree = !myP && !otherP;
                            const isCandidate = candidates.some(c => c.assignment.day_of_week===day && c.assignment.slot_id===slotId);
                            const isSelected = selectedPeriod?.day_of_week===day && selectedPeriod?.slot_id===slotId;

                            // กำหนดสีพื้นหลัง cell
                            let cellBg = "bg-white";
                            if (isSelected) cellBg = "bg-indigo-600";
                            else if (isCandidate) cellBg = "bg-amber-50";
                            else if (bothFree) cellBg = "bg-emerald-50";
                            else if (myP && otherP) cellBg = "bg-slate-50";

                            return (
                              <td key={slotId}
                                className={`border-r last:border-0 p-1 ${cellBg} transition`}
                                style={{height:'90px', verticalAlign:'top'}}>
                                <div className="flex flex-col gap-0.5 h-full">

                                  {/* ว่างทั้งคู่ */}
                                  {bothFree && (
                                    <div className="flex-1 flex items-center justify-center">
                                      <span className="text-emerald-500 text-[10px] font-bold">✓ ว่าง</span>
                                    </div>
                                  )}

                                  {/* คาบของฉัน */}
                                  {myP && (
                                    <div
                                      className={`flex-1 rounded-lg px-1.5 py-1 cursor-pointer transition
                                        ${isSelected
                                          ? 'bg-white/20 border border-white/40'
                                          : isCandidate
                                            ? 'bg-indigo-100 border border-indigo-300 hover:bg-indigo-200'
                                            : 'bg-indigo-50 border border-indigo-200 hover:bg-indigo-100'}`}
                                      onClick={() => findCandidates(myP)}>
                                      <div className={`text-[9px] font-bold uppercase mb-0.5 ${isSelected ? 'text-white' : 'text-indigo-400'}`}>
                                        {isSelected ? '👆 เลือกอยู่' : '👤 ฉัน'}
                                      </div>
                                      <div className={`text-[10px] font-bold leading-tight ${isSelected ? 'text-white' : 'text-indigo-800'}`}>
                                        {myP.subjects?.code}
                                      </div>
                                      <div className={`text-[9px] leading-tight truncate ${isSelected ? 'text-white/80' : 'text-indigo-600'}`}>
                                        {myP.subjects?.name}
                                      </div>
                                      <div className={`text-[8px] mt-0.5 ${isSelected ? 'text-white/60' : 'text-indigo-400'}`}>
                                        ห้อง {myP.classrooms?.name}
                                      </div>
                                    </div>
                                  )}

                                  {/* คาบของครูอีกคน */}
                                  {otherP && (
                                    <div
                                      className={`flex-1 rounded-lg px-1.5 py-1 cursor-pointer transition
                                        ${isCandidate
                                          ? 'bg-amber-100 border-2 border-amber-400 hover:bg-amber-200'
                                          : 'bg-violet-50 border border-violet-200 hover:bg-violet-100'}`}
                                      onClick={() => { if(isCandidate) setTargetPeriod(targetPeriod?.id===otherP.id ? null : otherP); }}>
                                      {isCandidate && (
                                        <div className="text-[9px] font-bold text-amber-600 mb-0.5">⚡ แลกได้!</div>
                                      )}
                                      {!isCandidate && (
                                        <div className="text-[9px] font-bold text-violet-400 mb-0.5">👤 เขา</div>
                                      )}
                                      <div className={`text-[10px] font-bold leading-tight ${isCandidate ? 'text-amber-800' : 'text-violet-800'}`}>
                                        {otherP.subjects?.code}
                                      </div>
                                      <div className={`text-[9px] leading-tight truncate ${isCandidate ? 'text-amber-700' : 'text-violet-600'}`}>
                                        {otherP.subjects?.name}
                                      </div>
                                      <div className={`text-[8px] mt-0.5 ${isCandidate ? 'text-amber-500' : 'text-violet-400'}`}>
                                        ห้อง {otherP.classrooms?.name}
                                      </div>
                                      {targetPeriod?.id === otherP.id && (
                                        <div className="text-[8px] font-bold text-amber-700 mt-0.5">✓ เลือกแลกนี้</div>
                                      )}
                                    </div>
                                  )}
                                </div>
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

            {/* Step 2: รายการคาบที่แลกได้ */}
            {selectedPeriod && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                  <div>
                    <h2 className="font-bold text-slate-800">เลือกคาบที่จะแลกด้วย</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      คาบที่แลกได้โดยไม่ชนตารางทั้งสองฝ่าย — กำลังมองหาคาบในห้อง <strong>{selectedPeriod.classrooms?.name}</strong>
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  {isLoading ? (
                    <div className="py-8 text-center text-slate-400 text-sm">⏳ กำลังค้นหาคาบที่แลกได้...</div>
                  ) : candidates.length === 0 ? (
                    <div className="py-8 text-center space-y-2">
                      <div className="text-3xl">😔</div>
                      <p className="text-slate-500 text-sm">ไม่พบคาบที่แลกได้โดยไม่ชนตาราง</p>
                      <p className="text-xs text-slate-400">ลองเลือกคาบอื่นของคุณดูครับ</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-emerald-600 font-bold px-1 mb-3">
                        พบ {candidates.length} คาบที่แลกได้ 🎉
                      </div>
                      {candidates.map(({ assignment: c }) => (
                        <button key={c.id}
                          onClick={() => setTargetPeriod(targetPeriod?.id === c.id ? null : c)}
                          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border-2 text-left transition
                            ${targetPeriod?.id === c.id
                              ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                              : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"}`}>
                          
                          {/* คาบของครูอีกคน */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${targetPeriod?.id === c.id ? "bg-emerald-200 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                                {c.day_of_week} คาบ {c.slot_id}
                              </span>
                              <span className="text-xs text-slate-400">{SLOT_LABELS[c.slot_id]}</span>
                            </div>
                            <div className="mt-1.5 font-semibold text-slate-700 text-sm">{c.subjects?.code} — {c.subjects?.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">👤 {c.teachers?.full_name} · ห้อง {c.classrooms?.name}</div>
                          </div>

                          <div className="shrink-0">
                            {targetPeriod?.id === c.id
                              ? <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
                              : <span className="w-6 h-6 rounded-full border-2 border-slate-300"></span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Preview + Confirm */}
            {selectedPeriod && targetPeriod && (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 p-5 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span>🔍 ตรวจสอบก่อนสลับ</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                  <div className="bg-white rounded-xl border border-blue-200 p-4">
                    <div className="text-xs text-blue-400 font-bold uppercase mb-2">คาบของคุณ (ก่อน)</div>
                    <div className="font-bold text-slate-800">{selectedPeriod.day_of_week} คาบ {selectedPeriod.slot_id}</div>
                    <div className="text-sm text-slate-600 mt-1">{selectedPeriod.subjects?.name}</div>
                    <div className="text-xs text-slate-400">ห้อง {selectedPeriod.classrooms?.name}</div>
                    <div className="mt-2 text-xs text-blue-500">👤 {session.full_name}</div>
                  </div>

                  <div className="flex items-center justify-center text-3xl">⇄</div>

                  <div className="bg-white rounded-xl border border-indigo-200 p-4">
                    <div className="text-xs text-indigo-400 font-bold uppercase mb-2">คาบที่แลก (ก่อน)</div>
                    <div className="font-bold text-slate-800">{targetPeriod.day_of_week} คาบ {targetPeriod.slot_id}</div>
                    <div className="text-sm text-slate-600 mt-1">{targetPeriod.subjects?.name}</div>
                    <div className="text-xs text-slate-400">ห้อง {targetPeriod.classrooms?.name}</div>
                    <div className="mt-2 text-xs text-indigo-500">👤 {targetPeriod.teachers?.full_name}</div>
                  </div>
                </div>

                <div className="mt-4 bg-white/70 rounded-xl border border-indigo-100 p-3 text-xs text-slate-500 space-y-1">
                  <div>✅ หลังสลับ: <strong className="text-slate-700">คุณ</strong> จะไปสอน{targetPeriod.subjects?.name} วัน{targetPeriod.day_of_week} คาบ {targetPeriod.slot_id} แทน</div>
                  <div>✅ หลังสลับ: <strong className="text-slate-700">{targetPeriod.teachers?.full_name}</strong> จะมาสอน{selectedPeriod.subjects?.name} วัน{selectedPeriod.day_of_week} คาบ {selectedPeriod.slot_id} แทน</div>
                </div>

                <button onClick={() => setConfirmOpen(true)} disabled={isLoading}
                  className="mt-4 w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition text-sm shadow-md disabled:opacity-50">
                  🔄 ยืนยันสลับคาบ
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: ประวัติ */}
        {tab === "history" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">📋 ประวัติการแลกคาบ</h2>
              <p className="text-xs text-slate-400 mt-0.5">ปี {termInfo.year} เทอม {termInfo.semester} · 50 รายการล่าสุด</p>
            </div>
            <div className="divide-y divide-slate-50">
              {history.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">ยังไม่มีประวัติการแลกคาบ</div>
              ) : history.map(h => (
                <div key={h.id} className="px-5 py-4 hover:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{h.requester_name}</span>
                        <span className="text-xs text-slate-400">แลกคาบ</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          {h.from_day} คาบ {h.from_slot_id} · {h.from_classroom_name}
                        </span>
                        <span className="text-xs text-slate-400">⇄</span>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                          {h.to_day} คาบ {h.to_slot_id} · {h.to_classroom_name}
                        </span>
                        <span className="text-xs text-slate-400">กับ {h.to_teacher_name}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {h.from_subject_name} ⇄ {h.to_subject_name}
                      </div>
                    </div>
                    <div className="text-xs text-slate-300 shrink-0 text-right">
                      {new Date(h.created_at).toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'numeric'})}
                      <br/>
                      {new Date(h.created_at).toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Loader */}
      {isLoading && (
        <div className="fixed bottom-5 right-5 bg-white p-3 rounded-xl shadow-xl border flex items-center gap-2 z-40">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-500">กำลังประมวลผล...</span>
        </div>
      )}
    </div>
  );
}