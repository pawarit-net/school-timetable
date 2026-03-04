"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient';
import Link from "next/link";

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
function fuzzyGroupTeachers(teachers: any[], threshold=0.8): [string, any[]][] {
  const canonicals: string[] = [];
  const groups: Record<string, any[]> = {};
  for (const t of teachers) {
    const dept = t.department?.trim() || "ไม่ระบุกลุ่มสาระ";
    let matched = canonicals.find(c => strSimilarity(c, dept) >= threshold);
    if (!matched) { matched = dept; canonicals.push(dept); groups[dept] = []; }
    groups[matched].push(t);
  }
  return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b,'th'));
}

const FONT_SIZES = [
  { label: "A", scale: 1,   cellH: 88  },
  { label: "A+", scale: 1.2, cellH: 108 },
  { label: "A++", scale: 1.45, cellH: 130 },
];

export default function TeacherSchedule() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [scheduleData, setScheduleData] = useState<any[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{day:string, slotId:number}|null>(null);
  const [meetingNote, setMeetingNote] = useState("ประชุมหมวด/PLC");

  const [academicYear, setAcademicYear] = useState<number|null>(null);
  const [semester, setSemester] = useState<string|null>(null);
  const settingsLoaded = useRef(false);

  const [targetScope, setTargetScope] = useState<'current'|'department'|'all'>('current');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{msg:string, onOk:()=>void}|null>(null);
  const [toast, setToast] = useState<{msg:string, type:'success'|'error'}|null>(null);

  // Font size & show breaks
  const [fontIdx, setFontIdx] = useState(() => {
    if (typeof window !== "undefined") return Number(localStorage.getItem("ts_fontIdx") || 0);
    return 0;
  });
  const [showBreaks, setShowBreaks] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("ts_breaks") !== "false";
    return true;
  });

  const fs = FONT_SIZES[fontIdx];

  useEffect(() => { localStorage.setItem("ts_fontIdx", String(fontIdx)); }, [fontIdx]);
  useEffect(() => { localStorage.setItem("ts_breaks", String(showBreaks)); }, [showBreaks]);

  const days = ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์"];
  const allSlots = [
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
  const timeSlots = showBreaks ? allSlots : allSlots.filter(s => !s.isBreak);

  const fuzzyGrouped = useMemo(() => fuzzyGroupTeachers(teachers, 0.8), [teachers]);

  function showToast(msg: string, type:'success'|'error'='success') {
    setToast({msg,type});
    setTimeout(()=>setToast(null),3000);
  }

  useEffect(()=>{ loadInitialData(); },[]);
  useEffect(()=>{
    if (!settingsLoaded.current) return;
    if (selectedTeacher && academicYear!==null && semester!==null)
      fetchSchedule(selectedTeacher, academicYear, semester);
    else setScheduleData([]);
  },[selectedTeacher, academicYear, semester]);

  async function loadInitialData() {
    const {data:tchs} = await supabase.from("teachers").select("*")
      .order("department",{ascending:true}).order("full_name",{ascending:true});
    if (tchs) setTeachers(tchs);
    const {data:settings} = await supabase.from("academic_settings").select("*").eq("id",1).single();
    const yr = settings?.year ?? 2569;
    const rawSem = String(settings?.semester ?? "1");
    const sm = rawSem==="3"?"Summer":rawSem;
    setAcademicYear(yr); setSemester(sm);
    settingsLoaded.current = true;
  }

  async function fetchSchedule(teacherId:string, year:number, sem:string) {
    const semVariants = sem==="Summer"?["Summer","3"]:sem==="3"?["Summer","3"]:[sem];
    const {data} = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(name,code), classrooms(name)`)
      .eq("teacher_id", teacherId)
      .eq("academic_year", year)
      .in("semester", semVariants);
    if (data) setScheduleData(data);
  }

  async function handleSetMeeting() {
    if (!activeSlot||!selectedTeacher||academicYear===null||semester===null) return;
    setIsProcessing(true);
    try {
      let ids: any[] = [];
      if (targetScope==='current') ids=[selectedTeacher];
      else if (targetScope==='all') ids=teachers.map(t=>t.id);
      else {
        const deptGroup = fuzzyGrouped.find(([,list])=>list.some(t=>String(t.id)===String(selectedTeacher)));
        ids = deptGroup?.[1]?.map(t=>t.id) ?? [selectedTeacher];
        if (!ids.length){showToast("ครูท่านนี้ไม่ได้ระบุหมวดวิชา","error");setIsProcessing(false);return;}
      }
      setConfirmModal({msg: targetScope==='current'?"ยืนยันการล็อกคาบนี้?":`⚠️ จะล็อกคาบนี้ให้ครู ${ids.length} ท่าน\nข้อมูลเก่าจะถูกลบ ยืนยัน?`, onOk: async ()=>{
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
        setIsModalOpen(false); fetchSchedule(selectedTeacher,academicYear,semester); setIsProcessing(false);
      }});
    } catch(err:any){showToast("เกิดข้อผิดพลาด: "+err.message,"error");setIsProcessing(false);}
  }

  async function handleMakeFree() {
    if (!activeSlot||academicYear===null||semester===null) return;
    let ids: any[] = [];
    if (targetScope==='current') ids=[selectedTeacher];
    else if (targetScope==='all') ids=teachers.map(t=>t.id);
    else { const dg = fuzzyGrouped.find(([,l])=>l.some(t=>String(t.id)===String(selectedTeacher))); ids=dg?.[1]?.map(t=>t.id)??[selectedTeacher]; }
    setConfirmModal({msg:`เคลียร์คาบนี้ให้ว่าง (${ids.length} คน)?`, onOk: async ()=>{
      setConfirmModal(null);
      const sv = semester==="Summer"?["Summer","3"]:[semester];
      await supabase.from("teaching_assignments").delete()
        .in("teacher_id",ids).eq("day_of_week",activeSlot.day)
        .eq("slot_id",activeSlot.slotId).eq("academic_year",academicYear).in("semester",sv);
      setIsModalOpen(false); fetchSchedule(selectedTeacher,academicYear,semester);
    }});
  }

  if (academicYear===null||semester===null)
    return <div className="min-h-screen flex items-center justify-center text-slate-400">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-black">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type==='success'?'bg-emerald-500':'bg-red-500'}`}>{toast.msg}</div>
      )}
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

      <div className="max-w-full px-4 md:px-8 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">👤 ตารางสอนรายบุคคล</h1>
            <p className="text-gray-500 text-sm mt-0.5">จัดการคาบสอน กิจกรรม และล็อกเวลาประชุมของครู</p>
          </div>
          <Link href="/" className="bg-white border px-4 py-2 rounded-lg hover:bg-gray-100 shadow-sm transition text-sm">⬅ กลับ</Link>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border mb-5 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">เลือกครูผู้สอน</label>
            <select className="w-full p-2.5 border-2 rounded-xl bg-gray-50 outline-none focus:border-purple-500 transition text-sm"
              value={selectedTeacher} onChange={e=>setSelectedTeacher(e.target.value)}>
              <option value="">-- เลือกรายชื่อครู --</option>
              {fuzzyGrouped.map(([dept,list])=>(
                <optgroup key={dept} label={`📂 ${dept}`}>
                  {list.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">ปีการศึกษา</label>
            <input type="number" value={academicYear} onChange={e=>setAcademicYear(Number(e.target.value))}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-center font-bold text-sm"/>
          </div>
          <div className="w-28">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">เทอม</label>
            <select value={semester} onChange={e=>setSemester(e.target.value)} className="w-full p-2.5 border rounded-xl bg-gray-50 font-bold text-sm">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="Summer">Summer</option>
            </select>
          </div>
          <div className="bg-indigo-50 px-3 py-2.5 rounded-xl border border-indigo-100 text-indigo-700 text-xs font-semibold whitespace-nowrap">
            📅 ปี {academicYear} เทอม {semester}
          </div>

          {/* ── ปุ่มปรับขนาด + ซ่อนพัก ── */}
          <div className="flex items-center gap-2 ml-auto">
            {/* ซ่อน/แสดงช่องพัก */}
            <button
              onClick={()=>setShowBreaks(v=>!v)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${showBreaks ? 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' : 'bg-slate-700 text-white border-slate-700'}`}
              title={showBreaks?"ซ่อนช่องพัก":"แสดงช่องพัก"}>
              {showBreaks ? "🙈 ซ่อนพัก" : "👁 แสดงพัก"}
            </button>
            {/* A- A A+ */}
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              {FONT_SIZES.map((f,i)=>(
                <button key={i} onClick={()=>setFontIdx(i)}
                  className={`px-3 py-2 text-sm font-bold transition ${fontIdx===i ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  style={{fontSize: `${0.7 + i*0.1}rem`}}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {selectedTeacher ? (
          <div className="bg-white rounded-2xl border shadow-md overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="border-collapse" style={{minWidth:'600px', width:'100%', tableLayout:'fixed', fontSize: `${fs.scale * 0.75}rem`}}>
                <colgroup>
                  <col style={{width:'60px'}}/>
                  {timeSlots.map(s=>(
                    <col key={s.id} style={{width: s.isBreak ? '40px' : '10%'}}/>
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
                  {days.map(day=>(
                    <tr key={day} className="border-b last:border-0">
                      <td className="p-2 border-r bg-slate-50 font-bold text-center text-slate-700" style={{fontSize:'0.85em'}}>{day}</td>
                      {timeSlots.map(slot=>{
                        if (slot.isBreak) return (
                          <td key={slot.id} className="bg-slate-50 border-r text-slate-300 text-center align-middle" style={{fontSize:'0.7em'}}>พัก</td>
                        );
                        const match = scheduleData.find(a=>a.day_of_week===day && a.slot_id===slot.id);
                        let cellBg = "bg-white hover:bg-slate-50";
                        if (match) cellBg = match.activity_type==='meeting'
                          ? "bg-orange-100 hover:bg-orange-200"
                          : "bg-blue-50 hover:bg-blue-100";
                        return (
                          <td key={slot.id}
                            className={`border-r p-1.5 text-center cursor-pointer transition group ${cellBg}`}
                            style={{height:`${fs.cellH}px`, verticalAlign:'middle'}}
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
                                    {match.classrooms?.name || "-"}
                                  </span>
                                  <span className="font-bold">{match.subjects?.code}</span>
                                  <span className="leading-tight line-clamp-2 px-0.5 text-blue-700" style={{fontSize:'0.85em'}}>{match.subjects?.name}</span>
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
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
            เลือกครูผู้สอนเพื่อเริ่มจัดการตาราง
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold mb-4 text-gray-800 border-b pb-3 flex justify-between items-center">
              <span>จัดการตารางเวลา</span>
              <span className="text-xs font-normal bg-gray-100 px-2 py-1 rounded text-gray-500">{activeSlot?.day} คาบ {activeSlot?.slotId}</span>
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อกิจกรรม / ประชุม</label>
                <input type="text" className="w-full border p-2 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-orange-200 outline-none transition"
                  placeholder="เช่น ประชุมหมวด, อบรม" value={meetingNote} onChange={e=>setMeetingNote(e.target.value)}/>
              </div>
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <label className="text-xs font-bold text-blue-800 block mb-2">เลือกเป้าหมาย:</label>
                <div className="space-y-2">
                  {[
                    {v:'current',label:'เฉพาะครูคนนี้'},
                    {v:'department',label:'ทั้งหมวดสาระฯ เดียวกัน'},
                    {v:'all',label:'ครูทุกคน (ทั้งโรงเรียน) ⚠️'},
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
                  className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 active:scale-95 transition disabled:opacity-50">
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