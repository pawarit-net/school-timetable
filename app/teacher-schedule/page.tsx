"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient';
import Link from "next/link";

// ─── Fuzzy grouping ───────────────────────────────────────────
function strSimilarity(a: string, b: string): number {
  a = a.trim().toLowerCase(); b = b.trim().toLowerCase();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return 1 - dp[m][n] / Math.max(m, n);
}
function fuzzyGroupTeachers(teachers: any[], threshold=0.8): [string, any[]][] {
  const canonicals: string[] = [];
  const groups: Record<string,any[]> = {};
  for (const t of teachers) {
    const dept = t.department?.trim() || "ไม่ระบุกลุ่มสาระ";
    let matched = canonicals.find(c => strSimilarity(c, dept) >= threshold);
    if (!matched) { matched = dept; canonicals.push(dept); groups[dept] = []; }
    groups[matched as string].push(t);
  }
  return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b,'th'));
}

// ─── Constants ────────────────────────────────────────────────
const DAYS = ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์"];
const ALL_SLOTS = [
  {id:1,  label:"คาบ 1", time:"08:30-09:20"},
  {id:2,  label:"คาบ 2", time:"09:20-10:10"},
  {id:"p1",label:"พัก",  time:"10:10-10:25", isBreak:true},
  {id:3,  label:"คาบ 3", time:"10:25-11:15"},
  {id:4,  label:"คาบ 4", time:"11:15-12:05"},
  {id:"p2",label:"พักเที่ยง",time:"12:05-13:00",isBreak:true},
  {id:5,  label:"คาบ 5", time:"13:00-13:50"},
  {id:"p3",label:"พัก",  time:"13:50-14:00", isBreak:true},
  {id:6,  label:"คาบ 6", time:"14:00-14:50"},
  {id:7,  label:"คาบ 7", time:"14:50-15:40"},
];
const REAL_SLOTS = ALL_SLOTS.filter(s => !s.isBreak) as {id:number,label:string,time:string}[];

// ─── Day colour palette ──────────────────────────────────────
const DAY_COLORS: Record<string,{header:string, cell:string, cellConflict:string, cellMeet:string, cellTeach:string}> = {
  "จันทร์":    { header:"bg-sky-100 text-sky-800",      cell:"bg-sky-50/60",    cellConflict:"bg-red-500",    cellMeet:"bg-orange-100", cellTeach:"bg-sky-100"     },
  "อังคาร":   { header:"bg-rose-100 text-rose-800",     cell:"bg-rose-50/60",   cellConflict:"bg-red-500",    cellMeet:"bg-orange-100", cellTeach:"bg-rose-100"    },
  "พุธ":       { header:"bg-emerald-100 text-emerald-800", cell:"bg-emerald-50/60", cellConflict:"bg-red-500", cellMeet:"bg-orange-100", cellTeach:"bg-emerald-100" },
  "พฤหัสบดี": { header:"bg-amber-100 text-amber-800",   cell:"bg-amber-50/60",  cellConflict:"bg-red-500",    cellMeet:"bg-orange-100", cellTeach:"bg-amber-100"   },
  "ศุกร์":    { header:"bg-violet-100 text-violet-800", cell:"bg-violet-50/60", cellConflict:"bg-red-500",    cellMeet:"bg-orange-100", cellTeach:"bg-violet-100"  },
};

const FONT_SIZES = [
  { label:"A",   scale:1,    cellH:88  },
  { label:"A+",  scale:1.2,  cellH:108 },
  { label:"A++", scale:1.45, cellH:130 },
];

// ─── Dept colours ─────────────────────────────────────────────
const DEPT_COLORS: Record<string,{bg:string,border:string,text:string,dot:string}> = {};
const COLOR_PALETTE = [
  {bg:"bg-blue-50",   border:"border-blue-200",   text:"text-blue-800",   dot:"bg-blue-400"},
  {bg:"bg-violet-50", border:"border-violet-200",  text:"text-violet-800", dot:"bg-violet-400"},
  {bg:"bg-emerald-50",border:"border-emerald-200", text:"text-emerald-800",dot:"bg-emerald-400"},
  {bg:"bg-amber-50",  border:"border-amber-200",   text:"text-amber-800",  dot:"bg-amber-400"},
  {bg:"bg-rose-50",   border:"border-rose-200",    text:"text-rose-800",   dot:"bg-rose-400"},
  {bg:"bg-cyan-50",   border:"border-cyan-200",    text:"text-cyan-800",   dot:"bg-cyan-400"},
  {bg:"bg-fuchsia-50",border:"border-fuchsia-200", text:"text-fuchsia-800",dot:"bg-fuchsia-400"},
  {bg:"bg-teal-50",   border:"border-teal-200",    text:"text-teal-800",   dot:"bg-teal-400"},
  {bg:"bg-orange-50", border:"border-orange-200",  text:"text-orange-800", dot:"bg-orange-400"},
  {bg:"bg-indigo-50", border:"border-indigo-200",  text:"text-indigo-800", dot:"bg-indigo-400"},
];
let _colorIdx = 0;
function getDeptColor(dept: string) {
  if (!DEPT_COLORS[dept]) { DEPT_COLORS[dept] = COLOR_PALETTE[_colorIdx++ % COLOR_PALETTE.length]; }
  return DEPT_COLORS[dept];
}

// ─── Conflict types ───────────────────────────────────────────
interface ConflictInfo {
  type: 'double_teach' | 'teach_and_meeting' | 'double_classroom';
  teacherIds: string[];
  teacherNames: string[];
  classroomName?: string;
  day: string;
  slotId: number;
}

// ═══════════════════════════════════════════════════════════════
export default function TeacherSchedule() {

  // ── shared state ──
  const [teachers,      setTeachers]      = useState<any[]>([]);
  const [allAssignments,setAllAssignments] = useState<any[]>([]);   // all teachers (overview)
  const [mySchedule,    setMySchedule]    = useState<any[]>([]);    // selected teacher only
  const [academicYear,  setAcademicYear]  = useState<number|null>(null);
  const [semester,      setSemester]      = useState<string|null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const settingsLoaded = useRef(false);

  // ── tabs ──
  const [tab, setTab] = useState<'individual'|'overview'|'conflicts'>('individual');

  // ── individual-tab state ──
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [isModalOpen,  setIsModalOpen]  = useState(false);
  const [activeSlot,   setActiveSlot]   = useState<{day:string,slotId:number}|null>(null);
  const [meetingNote,  setMeetingNote]  = useState("ประชุมหมวด/PLC");
  const [targetScope,  setTargetScope]  = useState<'current'|'department'|'all'>('current');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{msg:string,onOk:()=>void}|null>(null);
  const [toast,        setToast]        = useState<{msg:string,type:'success'|'error'}|null>(null);
  const [fontIdx,      setFontIdx]      = useState(0);
  const [showBreaks,   setShowBreaks]   = useState(true);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // ── overview-tab state ──
  const [deptFilter,      setDeptFilter]      = useState("all");
  const [conflictFilter,  setConflictFilter]  = useState<'all'|'double_teach'|'teach_and_meeting'|'double_classroom'>('all');
  const [tooltip,         setTooltip]         = useState<{x:number,y:number,items:any[]}|null>(null);

  const fs = FONT_SIZES[fontIdx];
  const timeSlots = showBreaks ? ALL_SLOTS : ALL_SLOTS.filter(s => !s.isBreak);
  const fuzzyGrouped = useMemo(() => fuzzyGroupTeachers(teachers, 0.8), [teachers]);
  useMemo(() => { fuzzyGrouped.forEach(([d]) => getDeptColor(d)); }, [fuzzyGrouped]);

  // ─── filtered teachers for overview ───────────────────────
  const filteredTeachers = useMemo(() => {
    if (deptFilter === "all") return teachers;
    return fuzzyGrouped.find(([d]) => d === deptFilter)?.[1] ?? [];
  }, [teachers, deptFilter, fuzzyGrouped]);

  // ─── conflict detection (overview) ────────────────────────
  const conflicts = useMemo((): ConflictInfo[] => {
    const result: ConflictInfo[] = [];
    const seen = new Set<string>();
    for (const day of DAYS) {
      for (const slot of REAL_SLOTS) {
        const sa = allAssignments.filter(a => a.day_of_week===day && a.slot_id===slot.id && a.teacher_id);

        // ① ครู 1 คน หลายรายการในคาบเดียว
        const byT: Record<string,any[]> = {};
        for (const a of sa) { const k=String(a.teacher_id); if(!byT[k])byT[k]=[]; byT[k].push(a); }
        for (const [tid,arr] of Object.entries(byT)) {
          if (arr.length < 2) continue;
          const key = `t-${tid}-${day}-${slot.id}`;
          if (seen.has(key)) continue; seen.add(key);
          const hasTeach = arr.some(a=>!a.activity_type);
          const hasMeet  = arr.some(a=>a.activity_type==='meeting');
          result.push({ type: hasTeach&&hasMeet?'teach_and_meeting':'double_teach',
            teacherIds:[tid], teacherNames:[arr[0].teachers?.full_name||tid], day, slotId:slot.id });
        }

        // ② ห้องเดียว ครู 2 คน
        const teaching = sa.filter(a=>!a.activity_type&&a.classroom_id);
        const byC: Record<string,any[]> = {};
        for (const a of teaching) { const k=String(a.classroom_id); if(!byC[k])byC[k]=[]; byC[k].push(a); }
        for (const [,arr] of Object.entries(byC)) {
          if (arr.length < 2) continue;
          const key = `c-${arr[0].classroom_id}-${day}-${slot.id}`;
          if (seen.has(key)) continue; seen.add(key);
          result.push({ type:'double_classroom',
            teacherIds: arr.map(a=>String(a.teacher_id)),
            teacherNames: arr.map(a=>a.teachers?.full_name||a.teacher_id),
            classroomName: arr[0].classrooms?.name,
            day, slotId:slot.id });
        }
      }
    }
    return result;
  }, [allAssignments]);

  const filteredConflicts = useMemo(() =>
    conflictFilter==='all' ? conflicts : conflicts.filter(c=>c.type===conflictFilter),
  [conflicts, conflictFilter]);

  // ─── stats (overview) ─────────────────────────────────────
  const stats = useMemo(() => {
    const tp: Record<string,number> = {};
    for (const a of allAssignments) {
      if (!a.teacher_id || a.activity_type==='meeting') continue;
      tp[a.teacher_id] = (tp[a.teacher_id]||0)+1;
    }
    const vals = Object.values(tp);
    return {
      avg:  vals.length ? (vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(1) : '0',
      max:  vals.length ? Math.max(...vals) : 0,
      total: allAssignments.filter(a=>!a.activity_type).length,
    };
  }, [allAssignments]);

  // ─── helpers ──────────────────────────────────────────────
  function showToast(msg:string, type:'success'|'error'='success') {
    setToast({msg,type}); setTimeout(()=>setToast(null),3000);
  }
  function cellAssigns(tid:string, day:string, slotId:number) {
    return allAssignments.filter(a=>String(a.teacher_id)===String(tid)&&a.day_of_week===day&&a.slot_id===slotId);
  }
  function hasCellConflict(tid:string, day:string, slotId:number) {
    return conflicts.some(c=>c.teacherIds.includes(String(tid))&&c.day===day&&c.slotId===slotId);
  }

  // ─── data loading ─────────────────────────────────────────
  useEffect(()=>{ loadInitialData(); },[]);
  useEffect(()=>{
    if (!settingsLoaded.current) return;
    if (selectedTeacher && academicYear!==null && semester!==null)
      fetchMySchedule(selectedTeacher, academicYear, semester);
    else setMySchedule([]);
  },[selectedTeacher, academicYear, semester]);

  async function loadInitialData() {
    setIsLoading(true);
    const [{data:tchs},{data:settings}] = await Promise.all([
      supabase.from("teachers").select("*").order("department").order("full_name"),
      supabase.from("academic_settings").select("*").eq("id",1).single(),
    ]);
    if (tchs) setTeachers(tchs);
    const yr  = settings?.year ?? 2569;
    const raw = String(settings?.semester ?? "1");
    const sm  = raw==="3"?"Summer":raw;
    setAcademicYear(yr); setSemester(sm);
    settingsLoaded.current = true;
    await fetchAllAssignments(yr, sm);
    setIsLoading(false);
  }

  async function fetchMySchedule(tid:string, year:number, sem:string) {
    const vars = sem==="Summer"?["Summer","3"]:[sem];
    const {data} = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(name,code), classrooms(name)`)
      .eq("teacher_id", tid).eq("academic_year", year).in("semester", vars);
    if (data) setMySchedule(data);
  }

  async function fetchAllAssignments(yr?:number, sm?:string) {
    const y = yr??academicYear; const s = sm??semester;
    if (y===null||s===null) return;
    const vars = s==="Summer"?["Summer","3"]:[s];
    const {data} = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(name,code), classrooms(name), teachers(full_name,department)`)
      .eq("academic_year", y).in("semester", vars).not("teacher_id","is",null);
    if (data) setAllAssignments(data);
  }

  // ─── individual-tab actions ────────────────────────────────
  async function handleSetMeeting() {
    if (!activeSlot||!selectedTeacher||academicYear===null||semester===null) return;
    setIsProcessing(true);
    try {
      let ids: any[] = [];
      if (targetScope==='current') ids=[selectedTeacher];
      else if (targetScope==='all') ids=teachers.map(t=>t.id);
      else {
        const dg = fuzzyGrouped.find(([,l])=>l.some(t=>String(t.id)===String(selectedTeacher)));
        ids = dg?.[1]?.map(t=>t.id)??[selectedTeacher];
        if (!ids.length){showToast("ครูท่านนี้ไม่ได้ระบุหมวดวิชา","error");setIsProcessing(false);return;}
      }
      setConfirmModal({
        msg: targetScope==='current'?"ยืนยันการล็อกคาบนี้?":
          `⚠️ จะล็อกคาบนี้ให้ครู ${ids.length} ท่าน\nข้อมูลเก่าจะถูกลบ ยืนยัน?`,
        onOk: async ()=>{
          setConfirmModal(null);
          const sv = semester==="Summer"?["Summer","3"]:[semester];
          await supabase.from("teaching_assignments").delete()
            .in("teacher_id",ids).eq("day_of_week",activeSlot.day)
            .eq("slot_id",activeSlot.slotId).eq("academic_year",academicYear).in("semester",sv);
          const {error} = await supabase.from("teaching_assignments").insert(
            ids.map(tId=>({teacher_id:tId,day_of_week:activeSlot.day,slot_id:activeSlot.slotId,
              academic_year:academicYear,semester,activity_type:'meeting',note:meetingNote,is_locked:true}))
          );
          if (error) throw error;
          showToast(`✅ ล็อกคาบให้ครู ${ids.length} ท่านแล้ว`);
          setIsModalOpen(false);
          fetchMySchedule(selectedTeacher,academicYear,semester);
          fetchAllAssignments();
          setIsProcessing(false);
        }
      });
    } catch(err:any){showToast("เกิดข้อผิดพลาด: "+err.message,"error");setIsProcessing(false);}
  }

  async function handleMakeFree() {
    if (!activeSlot||academicYear===null||semester===null) return;
    let ids: any[] = [];
    if (targetScope==='current') ids=[selectedTeacher];
    else if (targetScope==='all') ids=teachers.map(t=>t.id);
    else { const dg=fuzzyGrouped.find(([,l])=>l.some(t=>String(t.id)===String(selectedTeacher))); ids=dg?.[1]?.map(t=>t.id)??[selectedTeacher]; }
    setConfirmModal({msg:`เคลียร์คาบนี้ให้ว่าง (${ids.length} คน)?`, onOk:async()=>{
      setConfirmModal(null);
      const sv = semester==="Summer"?["Summer","3"]:[semester];
      await supabase.from("teaching_assignments").delete()
        .in("teacher_id",ids).eq("day_of_week",activeSlot.day)
        .eq("slot_id",activeSlot.slotId).eq("academic_year",academicYear).in("semester",sv);
      setIsModalOpen(false);
      fetchMySchedule(selectedTeacher,academicYear,semester);
      fetchAllAssignments();
    }});
  }

  // ═══════════════════════════════════════════════════════════
  if (academicYear===null||semester===null)
    return <div className="min-h-screen flex items-center justify-center text-slate-400">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-black">

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium
          ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`}>{toast.msg}</div>
      )}

      {/* ── Confirm modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="text-slate-700 text-sm whitespace-pre-line">{confirmModal.msg}</p>
            <div className="flex gap-3">
              <button onClick={()=>setConfirmModal(null)} className="flex-1 py-2.5 rounded-xl border text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={confirmModal.onOk} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tooltip (overview) ── */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none" style={{left:tooltip.x+12,top:tooltip.y-8}}>
          <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-3 text-xs max-w-[220px] space-y-1.5">
            {tooltip.items.map((a,i)=>(
              <div key={i} className={`pb-1.5 ${i<tooltip.items.length-1?'border-b border-slate-700':''}`}>
                {a.activity_type==='meeting'?(
                  <div className="flex items-center gap-1.5">
                    <span className="text-orange-400">📅</span>
                    <span className="font-bold text-orange-300">{a.note||"ประชุม"}</span>
                  </div>
                ):(
                  <>
                    <div className="font-bold text-white">{a.subjects?.name}</div>
                    <div className="text-slate-400">{a.subjects?.code} • ห้อง {a.classrooms?.name||"-"}</div>
                  </>
                )}
              </div>
            ))}
            {tooltip.items.length>=2&&(
              <div className="pt-1 flex items-center gap-1 text-red-400 font-bold"><span>⚠️</span><span>CONFLICT!</span></div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-full px-4 md:px-8 py-6">

        {/* ════ HEADER ════ */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">👤 ตารางสอนครู</h1>
            <p className="text-gray-500 text-sm mt-0.5">ปี {academicYear} เทอม {semester}</p>
          </div>
          <Link href="/" className="bg-white border px-4 py-2 rounded-lg hover:bg-gray-100 shadow-sm text-sm">⬅ กลับ</Link>
        </div>

        {/* ════ TAB BAR ════ */}
        <div className="flex gap-1 bg-white border rounded-2xl p-1 shadow-sm mb-5 w-fit">
          {[
            { key:'individual', label:'👤 รายบุคคล' },
            { key:'overview',   label:'📋 ตารางรวม' },
            { key:'conflicts',  label:`⚠️ Conflict${conflicts.length>0?` (${conflicts.length})`:''}`},
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key as any)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition
                ${tab===t.key
                  ? t.key==='conflicts'&&conflicts.length>0
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ════ YEAR / SEMESTER CONTROLS (shared) ════ */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border mb-5 flex flex-wrap gap-3 items-end">
          <div className="w-28">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">ปีการศึกษา</label>
            <input type="number" value={academicYear} onChange={e=>setAcademicYear(Number(e.target.value))}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-center font-bold text-sm"/>
          </div>
          <div className="w-28">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">เทอม</label>
            <select value={semester} onChange={e=>setSemester(e.target.value)}
              className="w-full p-2.5 border rounded-xl bg-gray-50 font-bold text-sm">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="Summer">Summer</option>
            </select>
          </div>

          {/* individual-tab extras */}
          {tab==='individual' && (
            <>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">เลือกครูผู้สอน</label>
                <select className="w-full p-2.5 border-2 rounded-xl bg-gray-50 outline-none focus:border-purple-500 text-sm"
                  value={selectedTeacher} onChange={e=>setSelectedTeacher(e.target.value)}>
                  <option value="">-- เลือกรายชื่อครู --</option>
                  {fuzzyGrouped.map(([dept,list])=>(
                    <optgroup key={dept} label={`📂 ${dept}`}>
                      {list.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={()=>setShowBreaks(v=>!v)}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold transition
                    ${showBreaks?'bg-white text-slate-500 border-slate-200':'bg-slate-700 text-white border-slate-700'}`}>
                  {showBreaks?"🙈 ซ่อนพัก":"👁 แสดงพัก"}
                </button>
                <div className="flex rounded-xl overflow-hidden border border-slate-200">
                  {FONT_SIZES.map((f,i)=>(
                    <button key={i} onClick={()=>setFontIdx(i)}
                      className={`px-3 py-2 text-sm font-bold transition
                        ${fontIdx===i?'bg-indigo-600 text-white':'bg-white text-slate-500 hover:bg-slate-50'}`}
                      style={{fontSize:`${0.7+i*0.1}rem`}}>{f.label}</button>
                  ))}
                </div>
                {selectedTeacher && (
                  <button onClick={()=>setShowPrintModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                    🖨️ พิมพ์ตาราง
                  </button>
                )}
              </div>
            </>
          )}

          {/* overview/conflict extras */}
          {(tab==='overview'||tab==='conflicts') && (
            <>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">กรองหมวดสาระ</label>
                <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm outline-none">
                  <option value="all">🌍 ทุกหมวดสาระ ({teachers.length} คน)</option>
                  {fuzzyGrouped.map(([dept,list])=>(
                    <option key={dept} value={dept}>{dept} ({list.length} คน)</option>
                  ))}
                </select>
              </div>
              <button onClick={()=>fetchAllAssignments()}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-sm">
                🔄 โหลดใหม่
              </button>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            กำลังโหลดข้อมูล...
          </div>
        ) : (
          <>
            {/* ════════════════════════════════════════════════════
                TAB: INDIVIDUAL
            ════════════════════════════════════════════════════ */}
            {tab==='individual' && (
              selectedTeacher ? (
                <div className="bg-white rounded-2xl border shadow-md overflow-hidden">
                  <div className="overflow-x-auto w-full" style={{WebkitOverflowScrolling:"touch"}}>
                    <table className="border-collapse" style={{minWidth:'600px',width:'100%',tableLayout:'fixed',fontSize:`${fs.scale*0.75}rem`}}>
                      <colgroup>
                        <col style={{width:'60px'}}/>
                        {timeSlots.map(s=>(
                          <col key={s.id} style={{width:s.isBreak?'40px':'10%'}}/>
                        ))}
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-100 border-b">
                          <th className="p-2 border-r text-slate-500 font-medium text-center" style={{fontSize:'0.7em'}}>วัน</th>
                          {timeSlots.map(s=>(
                            <th key={s.id} className={`p-1.5 border-r last:border-0 text-center ${s.isBreak?'bg-slate-50':''}`}>
                              <div className={`font-bold ${s.isBreak?'text-slate-300':'text-slate-600'}`} style={{fontSize:'0.85em'}}>{s.label}</div>
                              {!s.isBreak && <div className="text-slate-400 font-normal leading-tight" style={{fontSize:'0.72em'}}>{s.time}</div>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map(day=>(
                          <tr key={day} className="border-b last:border-0">
                            <td className="p-2 border-r bg-slate-50 font-bold text-center text-slate-700" style={{fontSize:'0.85em'}}>{day}</td>
                            {timeSlots.map(slot=>{
                              if (slot.isBreak) return (
                                <td key={slot.id} className="bg-slate-50 border-r text-slate-300 text-center align-middle" style={{fontSize:'0.7em'}}>พัก</td>
                              );
                              const match = mySchedule.find(a=>a.day_of_week===day&&a.slot_id===slot.id);
                              // highlight if this slot is a conflict for selected teacher
                              const isConflictCell = hasCellConflict(selectedTeacher, day, Number(slot.id));
                              let cellBg = "bg-white hover:bg-slate-50";
                              if (isConflictCell)    cellBg = "bg-red-100 hover:bg-red-200 ring-2 ring-inset ring-red-400";
                              else if (match)        cellBg = match.activity_type==='meeting'
                                ? "bg-orange-100 hover:bg-orange-200"
                                : "bg-blue-50 hover:bg-blue-100";
                              return (
                                <td key={slot.id}
                                  className={`border-r p-1.5 text-center cursor-pointer transition group ${cellBg}`}
                                  style={{height:`${fs.cellH}px`,verticalAlign:'middle'}}
                                  onClick={()=>{
                                    setActiveSlot({day,slotId:Number(slot.id)});
                                    setTargetScope('current');
                                    setMeetingNote(match?.activity_type==='meeting'?(match.note||"ประชุม"):"ประชุมหมวด/PLC");
                                    setIsModalOpen(true);
                                  }}>
                                  {match ? (
                                    match.activity_type==='meeting' ? (
                                      <div className="flex flex-col items-center justify-center h-full text-orange-800 gap-0.5">
                                        <span style={{fontSize:'1.3em'}}>📅</span>
                                        <span className="font-bold leading-tight line-clamp-2">{match.note}</span>
                                        <span className="bg-orange-200 px-1 py-0.5 rounded font-semibold" style={{fontSize:'0.75em'}}>LOCKED</span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center h-full text-blue-900 gap-0.5">
                                        <span className="bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded-full text-indigo-600 font-bold truncate max-w-full" style={{fontSize:'0.8em'}}>
                                          {match.classrooms?.name||"-"}
                                        </span>
                                        <span className="font-bold">{match.subjects?.code}</span>
                                        <span className="leading-tight line-clamp-2 px-0.5 text-blue-700" style={{fontSize:'0.85em'}}>{match.subjects?.name}</span>
                                        {isConflictCell && <span className="text-red-500 font-bold text-xs">⚠️ ซ้อน</span>}
                                      </div>
                                    )
                                  ) : (
                                    <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                      <span className="text-slate-300" style={{fontSize:'1.5em'}}>+</span>
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

                  {/* conflict inline summary for this teacher */}
                  {conflicts.some(c=>c.teacherIds.includes(String(selectedTeacher))) && (
                    <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                      <div className="font-bold text-red-700 mb-2 text-sm">⚠️ พบ Conflict สำหรับครูคนนี้</div>
                      <div className="space-y-1.5">
                        {conflicts.filter(c=>c.teacherIds.includes(String(selectedTeacher))).map((c,i)=>{
                          const si = REAL_SLOTS.find(s=>s.id===c.slotId);
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs text-red-700 bg-white px-3 py-2 rounded-lg border border-red-100">
                              <span className="font-bold">วัน{c.day} คาบ {c.slotId}</span>
                              <span className="text-red-400">•</span>
                              <span>{c.type==='double_teach'?'สอน 2 ห้องพร้อมกัน':c.type==='teach_and_meeting'?'สอน + ประชุมพร้อมกัน':'ห้องมีครู 2 คน'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
                  เลือกครูผู้สอนเพื่อเริ่มจัดการตาราง
                </div>
              )
            )}

            {/* ════════════════════════════════════════════════════
                TAB: OVERVIEW
            ════════════════════════════════════════════════════ */}
            {tab==='overview' && (
              <>
                {/* stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    {label:"คาบสอนทั้งหมด", value:stats.total, icon:"📚", color:"text-indigo-600"},
                    {label:"เฉลี่ย/คน",      value:`${stats.avg} คาบ`, icon:"📈", color:"text-emerald-600"},
                    {label:"สูงสุด",          value:`${stats.max} คาบ`, icon:"🏆", color:"text-amber-600"},
                    {label:"Conflict",        value:conflicts.length, icon:"⚠️",
                      color:conflicts.length>0?"text-red-600":"text-slate-400"},
                  ].map((s,i)=>(
                    <div key={i} className="bg-white rounded-2xl border p-4 shadow-sm">
                      <div className="text-xl mb-1">{s.icon}</div>
                      <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-2xl border shadow-sm">
                  {/* legend */}
                  <div className="px-4 py-3 border-b bg-slate-50 flex flex-wrap gap-3 items-center text-xs text-slate-500">
                    <span className="font-bold text-slate-600">สัญลักษณ์:</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-sky-100 border border-sky-200 inline-block"/><span className="text-sky-700 font-semibold">จ</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-100 border border-rose-200 inline-block"/><span className="text-rose-700 font-semibold">อ</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block"/><span className="text-emerald-700 font-semibold">พ</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200 inline-block"/><span className="text-amber-700 font-semibold">พฤ</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-violet-100 border border-violet-200 inline-block"/><span className="text-violet-700 font-semibold">ศ</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-200 inline-block"/><span>ประชุม/ล็อก</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block"/><span>Conflict</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-100 inline-block"/><span>ว่าง</span></span>
                    <span className="ml-auto text-slate-400">hover เพื่อดูรายละเอียด • คลิกดูตารางครู</span>
                  </div>

                  {/* scroll container — overflow:auto ทั้ง X และ Y ในกล่องเดียว
                      ทำให้ sticky left ทำงานได้ และ scroll แนวนอนได้เลยโดยไม่ต้องเลื่อนหน้า */}
                  <div style={{overflowX:'auto', overflowY:'auto', maxHeight:'70vh', WebkitOverflowScrolling:'touch' as any}}>
                    <table className="border-collapse" style={{minWidth:'980px', width:'max-content', fontSize:'0.72rem'}}>
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="border-r px-3 py-2 text-left font-bold text-slate-500 text-xs"
                            style={{minWidth:'150px', position:'sticky', left:0, zIndex:30,
                              background:'#f8fafc', boxShadow:'3px 0 6px -2px rgba(0,0,0,0.12)'}}>ครู</th>
                          <th className="border-r px-2 py-2 text-center font-bold text-slate-400 text-xs w-10"
                            style={{position:'sticky', left:'150px', zIndex:30, background:'#f8fafc',
                              boxShadow:'3px 0 6px -2px rgba(0,0,0,0.08)'}}>คาบ</th>
                          {DAYS.map(day=>
                            REAL_SLOTS.map((slot,si)=>(
                              <th key={`${day}-${slot.id}`}
                                className={`border-r last:border-0 px-1 py-1 text-center ${si===0?'border-l-2 border-l-slate-300':''} ${DAY_COLORS[day]?.header||''}`}
                                style={{minWidth:'44px'}}>
                                <div className="font-bold" style={{fontSize:'0.8em'}}>{si===0?day.slice(0,2):''}</div>
                                <div className="font-normal opacity-80" style={{fontSize:'0.72em'}}>{slot.id}</div>
                              </th>
                            ))
                          )}
                          <th className="px-3 py-2 text-center font-bold text-slate-400 text-xs w-12">รวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTeachers.map((teacher,tIdx)=>{
                          const canonDept = fuzzyGrouped.find(([,l])=>l.some(t=>t.id===teacher.id))?.[0] || "ไม่ระบุ";
                          const deptColor = getDeptColor(canonDept);
                          const periods = allAssignments.filter(a=>String(a.teacher_id)===String(teacher.id)&&!a.activity_type).length;
                          const anyConflict = conflicts.some(c=>c.teacherIds.includes(String(teacher.id)));
                          return (
                            <tr key={teacher.id}
                              className={`border-b ${anyConflict?'bg-red-50/40':tIdx%2===0?'bg-white':'bg-slate-50/30'}`}>
                              <td style={{minWidth:'150px', position:'sticky', left:0, zIndex:20,
                                background: anyConflict?'#fef2f2' : tIdx%2===0?'#ffffff':'#f8fafc',
                                boxShadow:'3px 0 6px -2px rgba(0,0,0,0.10)'}}>
                                <div className="px-3 py-1.5 flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${deptColor.dot}`}/>
                                  <div>
                                    <div className="font-semibold text-slate-800 text-xs leading-tight truncate max-w-[110px]" title={teacher.full_name}>
                                      {teacher.full_name}
                                    </div>
                                    <div className="text-slate-400 leading-tight truncate max-w-[110px]" style={{fontSize:'0.68rem'}}>{canonDept}</div>
                                  </div>
                                  {anyConflict && <span className="ml-auto text-red-500 flex-shrink-0">⚠️</span>}
                                </div>
                              </td>
                              <td className="border-r px-1 py-1.5 text-center"
                                style={{position:'sticky', left:'150px', zIndex:20,
                                  background: anyConflict?'#fef2f2' : tIdx%2===0?'#ffffff':'#f8fafc',
                                  boxShadow:'3px 0 6px -2px rgba(0,0,0,0.07)'}}>
                                <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-bold
                                  ${periods===0?'bg-slate-100 text-slate-400':
                                    periods>=20?'bg-red-100 text-red-600':
                                    periods>=15?'bg-amber-100 text-amber-700':
                                    'bg-emerald-100 text-emerald-700'}`}>{periods}</span>
                              </td>
                              {DAYS.map(day=>
                                REAL_SLOTS.map(slot=>{
                                  const cd = cellAssigns(teacher.id, day, slot.id);
                                  const cf = hasCellConflict(teacher.id, day, slot.id);
                                  const empty = cd.length===0;
                                  const isMeet = cd.length===1&&cd[0].activity_type==='meeting';
                                  const dc = DAY_COLORS[day] || {cell:"bg-slate-50/40",cellConflict:"bg-red-500",cellMeet:"bg-orange-100",cellTeach:"bg-blue-100"};
                                  let cls = dc.cell;
                                  if (cf)          cls = dc.cellConflict;
                                  else if (isMeet) cls = dc.cellMeet;
                                  else if (!empty) cls = dc.cellTeach;
                                  return (
                                    <td key={`${day}-${slot.id}`}
                                      className={`border-r last:border-r-0 p-0.5 text-center transition hover:brightness-90 cursor-pointer ${cls} ${slot.id===1?'border-l-2 border-l-slate-300':''}`}
                                      style={{height:'36px',width:'44px'}}
                                      onMouseEnter={!empty?(e)=>setTooltip({x:e.clientX,y:e.clientY,items:cd}):undefined}
                                      onMouseLeave={()=>setTooltip(null)}
                                      onMouseMove={!empty?(e)=>setTooltip(p=>p?{...p,x:e.clientX,y:e.clientY}:null):undefined}
                                      onClick={()=>{setSelectedTeacher(teacher.id);setTab('individual');}}>
                                      {cf?(
                                        <span className="text-white font-bold" style={{fontSize:'0.85em'}}>⚠</span>
                                      ):isMeet?(
                                        <span style={{fontSize:'0.9em'}}>📅</span>
                                      ):!empty?(
                                        <span className="font-bold text-blue-700 truncate block px-0.5" style={{fontSize:'0.7em'}}>
                                          {cd[0].classrooms?.name||"?"}
                                        </span>
                                      ):null}
                                    </td>
                                  );
                                })
                              )}
                              <td className="px-1 py-1.5 text-center">
                                <span className="text-xs text-slate-500 font-medium">{periods}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filteredTeachers.length===0&&(
                    <div className="py-12 text-center text-slate-400 text-sm">ไม่พบข้อมูลครู</div>
                  )}
                </div>
              </>
            )}

            {/* ════════════════════════════════════════════════════
                TAB: CONFLICTS
            ════════════════════════════════════════════════════ */}
            {tab==='conflicts' && (
              <div className="space-y-4">
                {/* stats mini */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {label:"ทั้งหมด",        value:conflicts.length,                                       key:'all'},
                    {label:"ครูสอนซ้อน",     value:conflicts.filter(c=>c.type==='double_teach').length,     key:'double_teach'},
                    {label:"สอน+ประชุม",     value:conflicts.filter(c=>c.type==='teach_and_meeting').length, key:'teach_and_meeting'},
                    {label:"ห้องมี 2 ครู",   value:conflicts.filter(c=>c.type==='double_classroom').length,  key:'double_classroom'},
                  ].map(s=>(
                    <button key={s.key} onClick={()=>setConflictFilter(s.key as any)}
                      className={`rounded-2xl border p-4 shadow-sm text-left transition
                        ${conflictFilter===s.key?'bg-red-500 border-red-500':'bg-white hover:border-red-300'}`}>
                      <div className={`text-2xl font-bold ${conflictFilter===s.key?'text-white':s.value>0?'text-red-600':'text-slate-400'}`}>{s.value}</div>
                      <div className={`text-xs mt-0.5 ${conflictFilter===s.key?'text-red-100':'text-slate-400'}`}>{s.label}</div>
                    </button>
                  ))}
                </div>

                {filteredConflicts.length===0?(
                  <div className="py-20 text-center bg-white rounded-2xl border shadow-sm">
                    <div className="text-4xl mb-3">✅</div>
                    <div className="text-lg font-bold text-slate-700">ไม่พบ Conflict</div>
                    <div className="text-sm text-slate-400 mt-1">ตารางสอนสะอาด ไม่มีการทับซ้อน</div>
                  </div>
                ):(
                  <div className="space-y-3">
                    {filteredConflicts.map((c,idx)=>{
                      const assigns = allAssignments.filter(
                        a=>c.teacherIds.includes(String(a.teacher_id))&&a.day_of_week===c.day&&a.slot_id===c.slotId
                      );
                      const slotInfo = REAL_SLOTS.find(s=>s.id===c.slotId);
                      const canonDept = fuzzyGrouped.find(([,l])=>l.some(t=>String(t.id)===c.teacherIds[0]))?.[0]||"ไม่ระบุ";
                      const dc = getDeptColor(canonDept);
                      return (
                        <div key={idx} className="bg-white rounded-2xl border-2 border-red-200 shadow-sm hover:border-red-400 transition">
                          <div className="flex items-start gap-4 p-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-xl">⚠️</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-2 items-center mb-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${dc.bg} ${dc.text} border ${dc.border}`}>{canonDept}</span>
                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                                  {c.type==='double_teach'?'📚 ครูสอน 2 ห้องพร้อมกัน'
                                    :c.type==='teach_and_meeting'?'⚡ สอน + ประชุมพร้อมกัน'
                                    :'🏫 ห้องเรียนมีครู 2 คนพร้อมกัน'}
                                </span>
                              </div>
                              <div className="font-bold text-slate-800 mb-1">
                                {c.type==='double_classroom'?`🏫 ห้อง ${c.classroomName||'?'}`:c.teacherNames[0]}
                              </div>
                              <div className="flex flex-wrap gap-2 text-sm text-slate-600 mb-3">
                                <span className="bg-slate-100 px-2 py-0.5 rounded-lg font-medium">📅 วัน{c.day}</span>
                                <span className="bg-slate-100 px-2 py-0.5 rounded-lg font-medium">⏰ คาบ {c.slotId} ({slotInfo?.time})</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {assigns.map((a,ai)=>(
                                  <div key={ai} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border
                                    ${a.activity_type==='meeting'?'bg-orange-50 border-orange-200 text-orange-800':'bg-blue-50 border-blue-200 text-blue-800'}`}>
                                    {a.activity_type==='meeting'?(
                                      <>📅 <span className="font-bold">{a.note||"ประชุม"}</span></>
                                    ):(
                                      <>
                                        <span className="font-bold">{a.subjects?.code}</span>
                                        <span>{a.subjects?.name}</span>
                                        <span className="bg-white px-1.5 py-0.5 rounded-lg font-bold text-xs border">{a.classrooms?.name||"?"}</span>
                                        {c.type==='double_classroom'&&(
                                          <span className="text-slate-500 text-xs">({a.teachers?.full_name||"?"})</span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* click to go to individual view */}
                            {c.type!=='double_classroom'&&(
                              <button onClick={()=>{setSelectedTeacher(c.teacherIds[0]);setTab('individual');}}
                                className="flex-shrink-0 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition whitespace-nowrap">
                                ดูตาราง →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ════ PRINT MODAL ════ */}
      {showPrintModal && selectedTeacher && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4" id="print-schedule-area">
            {/* header bar — ซ่อนตอนพิมพ์ */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 no-print">
              <h2 className="font-extrabold text-slate-800">🖨️ ตารางสอน — {teachers.find(t=>String(t.id)===String(selectedTeacher))?.full_name}</h2>
              <div className="flex gap-2">
                <button onClick={()=>window.print()} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700">
                  🖨️ พิมพ์ / บันทึก PDF
                </button>
                <button onClick={()=>setShowPrintModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200">✕ ปิด</button>
              </div>
            </div>

            {/* เนื้อหาที่จะพิมพ์ */}
            <div className="p-8 print-content" style={{fontFamily:"'Sarabun', sans-serif"}}>

              {/* ── หัวกระดาษ ── */}
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",borderBottom:"3px solid #6366f1",paddingBottom:"16px",marginBottom:"20px"}}>
                <div>
                  <div style={{fontSize:"22px",fontWeight:900,color:"#1e293b",letterSpacing:"-0.5px"}}>ตารางสอนประจำภาคเรียน</div>
                  <div style={{fontSize:"18px",fontWeight:800,color:"#4f46e5",marginTop:"6px"}}>
                    {teachers.find(t=>String(t.id)===String(selectedTeacher))?.full_name}
                  </div>
                  <div style={{fontSize:"12px",color:"#64748b",marginTop:"3px",display:"flex",gap:"8px",alignItems:"center"}}>
                    <span style={{background:"#ede9fe",color:"#7c3aed",borderRadius:"6px",padding:"2px 10px",fontWeight:600,fontSize:"11px"}}>
                      กลุ่มสาระ{teachers.find(t=>String(t.id)===String(selectedTeacher))?.department||"ไม่ระบุ"}
                    </span>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"13px",color:"#475569",fontWeight:600}}>ปีการศึกษา {academicYear}</div>
                  <div style={{fontSize:"13px",color:"#475569"}}>ภาคเรียนที่ {semester}</div>
                  <div style={{display:"flex",gap:"8px",marginTop:"8px",justifyContent:"flex-end"}}>
                    <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"8px",padding:"4px 12px",textAlign:"center"}}>
                      <div style={{fontSize:"18px",fontWeight:800,color:"#1d4ed8"}}>{mySchedule.filter(a=>!a.activity_type).length}</div>
                      <div style={{fontSize:"9px",color:"#60a5fa"}}>คาบสอน</div>
                    </div>
                    <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:"8px",padding:"4px 12px",textAlign:"center"}}>
                      <div style={{fontSize:"18px",fontWeight:800,color:"#c2410c"}}>{mySchedule.filter(a=>a.activity_type==='meeting').length}</div>
                      <div style={{fontSize:"9px",color:"#fb923c"}}>ประชุม</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ตาราง ── */}
              <table style={{borderCollapse:"collapse",width:"100%",fontSize:"11px",tableLayout:"fixed"}}>
                <colgroup>
                  <col style={{width:"64px"}}/>
                  {[1,2,3,4,5,6,7].map(s=><col key={s}/>)}
                </colgroup>
                <thead>
                  {/* แถวชื่อครู spanning ทุก column */}
                  <tr>
                    <th colSpan={8} style={{background:"#4f46e5",color:"white",border:"1px solid #4338ca",padding:"8px 12px",textAlign:"left"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                          <span style={{fontSize:"15px",fontWeight:800,letterSpacing:"0.2px"}}>
                            👤 {teachers.find(t=>String(t.id)===String(selectedTeacher))?.full_name}
                          </span>
                          <span style={{background:"#818cf8",borderRadius:"6px",padding:"2px 10px",fontSize:"11px",fontWeight:600,color:"white",opacity:0.9}}>
                            {teachers.find(t=>String(t.id)===String(selectedTeacher))?.department||"ไม่ระบุกลุ่มสาระ"}
                          </span>
                        </div>
                        <span style={{fontSize:"11px",opacity:0.8,fontWeight:500}}>
                          ปีการศึกษา {academicYear} ภาคเรียนที่ {semester}
                        </span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th style={{background:"#1e293b",color:"white",border:"1px solid #334155",padding:"8px 4px",textAlign:"center",fontWeight:700,fontSize:"12px",borderRadius:"0"}}>วัน</th>
                    {[1,2,3,4,5,6,7].map(s=>(
                      <th key={s} style={{background:"#1e293b",color:"white",border:"1px solid #334155",padding:"6px 4px",textAlign:"center",fontWeight:700}}>
                        <div style={{fontSize:"12px"}}>คาบ {s}</div>
                        <div style={{fontSize:"9px",color:"#94a3b8",fontWeight:400,marginTop:"2px"}}>
                          {({1:"08:30",2:"09:20",3:"10:25",4:"11:15",5:"13:00",6:"14:00",7:"14:50"} as Record<number,string>)[s]}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day,di)=>{
                    const dayColors = [
                      {bg:"#eff6ff",border:"#93c5fd",text:"#1d4ed8",header:"#dbeafe",headerText:"#1e40af"},
                      {bg:"#fff1f2",border:"#fca5a5",text:"#be123c",header:"#fecdd3",headerText:"#9f1239"},
                      {bg:"#f0fdf4",border:"#86efac",text:"#15803d",header:"#bbf7d0",headerText:"#14532d"},
                      {bg:"#fffbeb",border:"#fcd34d",text:"#b45309",header:"#fde68a",headerText:"#92400e"},
                      {bg:"#f5f3ff",border:"#c4b5fd",text:"#7c3aed",header:"#ddd6fe",headerText:"#4c1d95"},
                    ];
                    const dc = dayColors[di];
                    return (
                      <tr key={day}>
                        <td style={{border:`2px solid ${dc.border}`,padding:"6px 4px",textAlign:"center",fontWeight:800,fontSize:"12px",background:dc.header,color:dc.headerText,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>
                          {day}
                        </td>
                        {[1,2,3,4,5,6,7].map(slotId=>{
                          const match = mySchedule.find(a=>a.day_of_week===day&&a.slot_id===slotId);
                          if (!match) return (
                            <td key={slotId} style={{border:"1px solid #e2e8f0",height:"80px",background:"white"}}/>
                          );
                          if (match.activity_type==='meeting') return (
                            <td key={slotId} style={{border:`1px solid #fed7aa`,height:"80px",background:"#fff7ed",verticalAlign:"middle",textAlign:"center",padding:"4px"}}>
                              <div style={{fontSize:"16px",marginBottom:"2px"}}>📅</div>
                              <div style={{fontWeight:700,color:"#c2410c",fontSize:"10px",lineHeight:1.3}}>{match.note||"ประชุม"}</div>
                            </td>
                          );
                          return (
                            <td key={slotId} style={{border:`1px solid ${dc.border}`,height:"80px",background:dc.bg,verticalAlign:"middle",padding:"4px"}}>
                              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:"3px"}}>
                                <div style={{background:"white",border:`1px solid ${dc.border}`,borderRadius:"6px",padding:"2px 8px",color:dc.text,fontWeight:700,fontSize:"10px",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {match.classrooms?.name||"-"}
                                </div>
                                <div style={{fontWeight:800,color:dc.text,fontSize:"11px",textAlign:"center"}}>{match.subjects?.code}</div>
                                <div style={{color:"#475569",fontSize:"9px",textAlign:"center",lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any,overflow:"hidden",maxWidth:"100%"}}>
                                  {match.subjects?.name}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ── legend ── */}
              <div style={{display:"flex",gap:"16px",marginTop:"10px",fontSize:"9px",color:"#94a3b8"}}>
                <span>🔵 = จันทร์ &nbsp; 🔴 = อังคาร &nbsp; 🟢 = พุธ &nbsp; 🟡 = พฤหัสบดี &nbsp; 🟣 = ศุกร์ &nbsp; 📅 = ประชุม/ล็อก</span>
              </div>

              {/* ── ลายเซ็น ── */}
              <div style={{marginTop:"40px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"32px"}}>
                {([
                  ["ครูผู้สอน", teachers.find(t=>String(t.id)===String(selectedTeacher))?.full_name||""],
                  ["หัวหน้ากลุ่มสาระ", ""],
                  ["ผู้อำนวยการโรงเรียน", ""],
                ] as [string,string][]).map(([role,name])=>(
                  <div key={role} style={{textAlign:"center"}}>
                    <div style={{marginTop:"44px",borderTop:"1.5px solid #475569",paddingTop:"8px"}}>
                      <div style={{fontWeight:700,color:"#1e293b",fontSize:"12px"}}>{name||"................................"}</div>
                      <div style={{fontSize:"11px",color:"#64748b",marginTop:"3px"}}>{role}</div>
                      <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px"}}>วันที่ ........../........../..........
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #print-schedule-area, #print-schedule-area * { visibility: visible !important; }
              #print-schedule-area {
                position: fixed !important;
                top: 0 !important; left: 0 !important;
                width: 100% !important; height: auto !important;
                background: white !important;
                z-index: 9999 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                margin: 0 !important;
                max-width: 100% !important;
              }
              .no-print { display: none !important; }
              @page {
                margin: 0 !important;
                size: A4 landscape;
              }
              /* ซ่อน header/footer ของ browser */
              html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `}</style>
        </div>
      )}

      {/* ════ MEETING MODAL (individual tab) ════ */}
      {isModalOpen&&(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold mb-4 text-gray-800 border-b pb-3 flex justify-between items-center">
              <span>จัดการตารางเวลา</span>
              <span className="text-xs font-normal bg-gray-100 px-2 py-1 rounded text-gray-500">{activeSlot?.day} คาบ {activeSlot?.slotId}</span>
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อกิจกรรม / ประชุม</label>
                <input type="text"
                  className="w-full border p-2 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-orange-200 outline-none"
                  placeholder="เช่น ประชุมหมวด, อบรม"
                  value={meetingNote} onChange={e=>setMeetingNote(e.target.value)}/>
              </div>
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <label className="text-xs font-bold text-blue-800 block mb-2">เลือกเป้าหมาย:</label>
                <div className="space-y-2">
                  {[
                    {v:'current',    label:'เฉพาะครูคนนี้'},
                    {v:'department', label:'ทั้งหมวดสาระฯ เดียวกัน'},
                    {v:'all',        label:'ครูทุกคน (ทั้งโรงเรียน) ⚠️'},
                  ].map(opt=>(
                    <label key={opt.v} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1 rounded transition">
                      <input type="radio" name="scope" checked={targetScope===opt.v}
                        onChange={()=>setTargetScope(opt.v as any)}
                        className={opt.v==='all'?'accent-red-600':'accent-blue-600'}/>
                      <span className={targetScope==='all'&&opt.v==='all'?"font-bold text-red-600":""}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSetMeeting} disabled={isProcessing}
                  className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50">
                  {isProcessing?"กำลังบันทึก...":"🔒 ล็อกเวลา"}
                </button>
                <button onClick={handleMakeFree} disabled={isProcessing}
                  className="px-4 border border-gray-200 text-gray-500 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">🗑️</button>
              </div>
              <button onClick={()=>setIsModalOpen(false)} className="text-xs text-center text-gray-400 hover:underline">ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}