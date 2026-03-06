"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

// --- Fuzzy grouping ---
function strSimilarity(a: string, b: string): number {
  a = a.trim().toLowerCase(); b = b.trim().toLowerCase();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return 1-dp[m][n]/Math.max(m,n);
}
function fuzzyGroupTeachers(teachers:{id:string,full_name:string,department?:string}[], threshold=0.8) {
  const canonicals:string[]=[], groups:Record<string,typeof teachers>={};
  for (const t of teachers) {
    const dept=t.department?.trim()||"ไม่ระบุกลุ่มสาระ";
    let matched=canonicals.find(c=>strSimilarity(c,dept)>=threshold);
    if (!matched){matched=dept;canonicals.push(dept);groups[dept]=[];}
    groups[matched].push(t);
  }
  return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b,"th"));
}

// ─── Types ───────────────────────────────────────────────────
interface Assignment {
  id:number; day_of_week:string; slot_id:number;
  classroom_id:string; subject_id:string; teacher_id:string;
  academic_year:string; semester:string; is_locked:boolean;
  subjects?:{code:string;name:string};
  classrooms?:{name:string};
  teachers?:{full_name:string};
}
interface SwapOption {
  assignment: Assignment;
  teacherB: {id:string; full_name:string; department?:string};
  bothWayOk: boolean;
}
interface SwapHistory {
  id:number; created_at:string;
  requester_id:string; requester_name:string;
  from_day:string; from_slot_id:number;
  from_classroom_id:string; from_classroom_name:string;
  from_subject_id:string; from_subject_name:string;
  to_day:string; to_slot_id:number;
  to_classroom_id:string; to_classroom_name:string;
  to_subject_id:string; to_subject_name:string;
  to_teacher_id:string; to_teacher_name:string;
  academic_year:string; semester:string;
}

// ─── Constants ────────────────────────────────────────────────
const DAYS = ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์"];
const ALL_SLOTS = [1,2,3,4,5,6,7];
const SLOT_TIME:Record<number,string> = {
  1:"08:30-09:20",2:"09:20-10:10",3:"10:25-11:15",
  4:"11:15-12:05",5:"13:00-13:50",6:"14:00-14:50",7:"14:50-15:40"
};

type Step = 1|2|3|4;

// ─────────────────────────────────────────────────────────────
// resolveTeacher:
//   ดึง "ครูที่สอนจริงวันนี้" โดย overlay swap_history ทับ teaching_assignments
//   teaching_assignments ไม่ถูกแก้ไขเลย — swap_history เป็น source of truth ของการแลก
// ─────────────────────────────────────────────────────────────
function resolveEffectiveTeacher(
  assignment: Assignment,
  swapHistory: SwapHistory[]
): string {
  // หา swap record ที่เกี่ยวข้องกับ assignment นี้
  // กรณี A แลกออก: from_day+from_slot_id+from_classroom_id ตรงกัน → ครูที่สอนจริงคือ to_teacher
  // กรณี B แลกเข้า: to_day+to_slot_id+to_classroom_id ตรงกัน → ครูที่สอนจริงคือ requester
  for (const h of swapHistory) {
    if (
      h.from_day === assignment.day_of_week &&
      h.from_slot_id === assignment.slot_id &&
      h.from_classroom_id === assignment.classroom_id
    ) {
      return h.to_teacher_id; // B สอนแทน A
    }
    if (
      h.to_day === assignment.day_of_week &&
      h.to_slot_id === assignment.slot_id &&
      h.to_classroom_id === assignment.classroom_id
    ) {
      return h.requester_id; // A ไปสอนแทน B
    }
  }
  return assignment.teacher_id; // ไม่มีการแลก → ครูเดิม
}

// ─────────────────────────────────────────────────────────────
// resolveTeacherSchedule:
//   สร้าง "ตารางสอนจริง" ของครูคนหนึ่ง โดยรวม swap_history
//   - คาบที่ครูสอนตามปกติ (teaching_assignments) แต่ไม่ได้แลกออก
//   - คาบที่ครูรับมาสอนแทน (swap_history ฝั่ง to_teacher หรือ requester)
// ─────────────────────────────────────────────────────────────
function resolveTeacherEffectiveSlots(
  teacherId: string,
  allAssignments: Assignment[],
  swapHistory: SwapHistory[]
): Set<string> {
  const busy = new Set<string>();

  // 1. คาบที่มีใน teaching_assignments และยังไม่ได้แลกออก
  for (const a of allAssignments) {
    if (a.teacher_id !== teacherId) continue;
    const effectiveTeacher = resolveEffectiveTeacher(a, swapHistory);
    if (effectiveTeacher === teacherId) {
      busy.add(`${a.day_of_week}-${a.slot_id}`);
    }
  }

  // 2. คาบที่ครูรับมาสอนแทน (ฝั่ง "เข้า")
  for (const h of swapHistory) {
    // A ไปสอนที่ห้อง B → A ติดคาบ to_day+to_slot
    if (h.requester_id === teacherId) {
      busy.add(`${h.to_day}-${h.to_slot_id}`);
    }
    // B ไปสอนที่ห้อง A → B ติดคาบ from_day+from_slot
    if (h.to_teacher_id === teacherId) {
      busy.add(`${h.from_day}-${h.from_slot_id}`);
    }
  }

  return busy;
}

// ─── Sub-components ──────────────────────────────────────────

function SwapTimetable({ teacherAPeriods, teacherBOption, selectedPeriod, teacherAName, swapHistory, allAssignments }: {
  teacherAPeriods: Assignment[];
  teacherBOption: SwapOption;
  selectedPeriod: Assignment;
  teacherAName: string;
  swapHistory: SwapHistory[];
  allAssignments: Assignment[];
}) {
  const bPeriod = teacherBOption.assignment;
  const bName = teacherBOption.teacherB.full_name;

  return (
    <div className="mb-4">
      <div className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3">📅 ตารางสอนก่อน → หลังแลก</div>
      <div className="flex flex-wrap gap-3 text-xs mb-3">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 inline-block"/><span className="text-blue-700 font-bold">คาบที่แลกออก</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 inline-block"/><span className="text-emerald-700 font-bold">คาบที่รับเข้า</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 inline-block"/><span className="text-slate-500">คาบเดิม</span></span>
      </div>

      {/* ครู A */}
      <div className="mb-4">
        <div className="text-sm font-extrabold text-indigo-600 mb-2">👤 {teacherAName} (ครู A)</div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs" style={{minWidth:'560px',width:'100%',tableLayout:'fixed'}}>
            <colgroup>
              <col style={{width:'56px'}}/>
              {ALL_SLOTS.map(s=><col key={s} style={{width:'calc((100% - 56px)/7)'}}/>)}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-1.5 border-r border-slate-200 text-slate-400 font-medium text-center">วัน</th>
                {ALL_SLOTS.map(s=>(
                  <th key={s} className="p-1 border-r last:border-0 border-slate-200 text-center">
                    <div className="font-bold text-slate-500">คาบ {s}</div>
                    <div className="text-[9px] text-slate-400 font-normal">{SLOT_TIME[s]?.split('-')[0]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day=>(
                <tr key={day} className="border-b border-slate-100 last:border-0">
                  <td className="p-1.5 border-r border-slate-200 bg-slate-50 font-bold text-center text-slate-600 text-[11px]">{day}</td>
                  {ALL_SLOTS.map(slotId=>{
                    const isSwapOut = day===selectedPeriod.day_of_week && slotId===selectedPeriod.slot_id;
                    const isSwapIn  = day===bPeriod.day_of_week && slotId===bPeriod.slot_id;
                    const period = teacherAPeriods.find(p=>p.day_of_week===day&&p.slot_id===slotId);
                    if (isSwapOut) return (
                      <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'64px'}}>
                        <div className="h-full rounded-lg bg-blue-50 border-2 border-blue-300 p-1 flex flex-col justify-center items-center text-center relative">
                          <div className="text-[8px] font-bold text-blue-400 mb-0.5">แลกออก →</div>
                          <div className="text-[10px] font-extrabold text-blue-700 leading-tight line-clamp-2">{period?.subjects?.name||"-"}</div>
                          <div className="text-[8px] text-blue-400">{period?.classrooms?.name}</div>
                          <div className="absolute top-0.5 right-0.5 text-blue-300 text-[10px]">↗</div>
                        </div>
                      </td>
                    );
                    if (isSwapIn) return (
                      <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'64px'}}>
                        <div className="h-full rounded-lg bg-emerald-50 border-2 border-emerald-300 p-1 flex flex-col justify-center items-center text-center relative">
                          <div className="text-[8px] font-bold text-emerald-400 mb-0.5">← รับเข้า</div>
                          <div className="text-[10px] font-extrabold text-emerald-700 leading-tight line-clamp-2">{bPeriod.subjects?.name||"-"}</div>
                          <div className="text-[8px] text-emerald-400">{bPeriod.classrooms?.name}</div>
                          <div className="absolute top-0.5 right-0.5 text-emerald-300 text-[10px]">↙</div>
                        </div>
                      </td>
                    );
                    if (period) return (
                      <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'64px'}}>
                        <div className="h-full rounded-lg bg-slate-50 border border-slate-200 p-1 flex flex-col justify-center items-center text-center">
                          <div className="text-[10px] font-bold text-slate-600 leading-tight line-clamp-2">{period.subjects?.name}</div>
                          <div className="text-[8px] text-slate-400">{period.classrooms?.name}</div>
                        </div>
                      </td>
                    );
                    return <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'64px'}}><div className="h-full rounded-lg bg-white flex items-center justify-center"><span className="text-slate-200 text-xs">-</span></div></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ครู B — 2 คาบที่เกี่ยวข้อง */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
        <div className="text-sm font-extrabold text-emerald-700 mb-2">👤 {bName} (ครู B) — คาบที่เกี่ยวข้อง</div>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px] bg-white border-2 border-emerald-300 rounded-xl p-3 text-center">
            <div className="text-[10px] font-bold text-emerald-400 mb-1">คาบที่ให้ A มาสอนแทน</div>
            <div className="font-extrabold text-sm">{bPeriod.day_of_week} คาบ {bPeriod.slot_id}</div>
            <div className="text-xs text-slate-600 mt-0.5">{bPeriod.subjects?.name}</div>
            <div className="text-[10px] text-slate-400">{bPeriod.classrooms?.name}</div>
          </div>
          <div className="flex-1 min-w-[140px] bg-white border-2 border-blue-300 rounded-xl p-3 text-center">
            <div className="text-[10px] font-bold text-blue-400 mb-1">คาบที่ B ต้องไปสอนแทน</div>
            <div className="font-extrabold text-sm">{selectedPeriod.day_of_week} คาบ {selectedPeriod.slot_id}</div>
            <div className="text-xs text-slate-600 mt-0.5">{selectedPeriod.subjects?.name}</div>
            <div className="text-[10px] text-slate-400">{selectedPeriod.classrooms?.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryTimetable({ record }: { record: SwapHistory }) {
  return (
    <div>
      <div className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3">📅 สรุปการแลกคาบ</div>
      <div className="overflow-x-auto mb-4">
        <table className="border-collapse text-xs" style={{minWidth:'560px',width:'100%',tableLayout:'fixed'}}>
          <colgroup>
            <col style={{width:'56px'}}/>
            {ALL_SLOTS.map(s=><col key={s} style={{width:'calc((100% - 56px)/7)'}}/>)}
          </colgroup>
          <thead>
            <tr className="bg-white border-b border-slate-200">
              <th className="p-1.5 border-r border-slate-200 text-slate-400 text-center font-medium">วัน</th>
              {ALL_SLOTS.map(s=>(
                <th key={s} className="p-1 border-r last:border-0 border-slate-200 text-center">
                  <div className="font-bold text-slate-500">คาบ {s}</div>
                  <div className="text-[9px] text-slate-300 font-normal">{SLOT_TIME[s]?.split('-')[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day=>(
              <tr key={day} className="border-b border-slate-100 last:border-0">
                <td className="p-1.5 border-r border-slate-200 bg-white font-bold text-center text-slate-500 text-[11px]">{day}</td>
                {ALL_SLOTS.map(slotId=>{
                  const isFrom = day===record.from_day && slotId===record.from_slot_id;
                  const isTo   = day===record.to_day   && slotId===record.to_slot_id;
                  if (isFrom) return (
                    <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'72px'}}>
                      <div className="h-full rounded-lg border-2 border-blue-300 bg-blue-50 p-1.5 flex flex-col gap-0.5">
                        <div className="text-[8px] font-extrabold text-blue-400">ก่อน → A สอน</div>
                        <div className="text-[10px] font-extrabold text-blue-800 leading-tight line-clamp-2">{record.from_subject_name}</div>
                        <div className="text-[8px] text-blue-400">{record.from_classroom_name}</div>
                        <div className="mt-auto text-[8px] font-bold text-emerald-600 bg-emerald-100 rounded px-1">หลัง → B สอนแทน</div>
                      </div>
                    </td>
                  );
                  if (isTo) return (
                    <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'72px'}}>
                      <div className="h-full rounded-lg border-2 border-emerald-300 bg-emerald-50 p-1.5 flex flex-col gap-0.5">
                        <div className="text-[8px] font-extrabold text-emerald-400">ก่อน → B สอน</div>
                        <div className="text-[10px] font-extrabold text-emerald-800 leading-tight line-clamp-2">{record.to_subject_name}</div>
                        <div className="text-[8px] text-emerald-400">{record.to_classroom_name}</div>
                        <div className="mt-auto text-[8px] font-bold text-blue-600 bg-blue-100 rounded px-1">หลัง → A สอนแทน</div>
                      </div>
                    </td>
                  );
                  return (
                    <td key={slotId} className="border-r last:border-0 border-slate-100 p-0.5" style={{height:'72px'}}>
                      <div className="h-full rounded bg-white flex items-center justify-center">
                        <span className="text-slate-200 text-xs">—</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="text-[10px] font-extrabold text-blue-400 uppercase mb-1">🔵 คาบที่แลกออก (A→B)</div>
          <div className="font-extrabold text-sm text-blue-800">{record.from_day} คาบ {record.from_slot_id}</div>
          <div className="text-xs text-slate-500 mt-0.5">{record.from_subject_name}</div>
          <div className="text-xs text-blue-400">{record.from_classroom_name}</div>
          <div className="text-[10px] text-slate-400 mt-1 border-t border-blue-100 pt-1">ให้ <span className="font-bold text-blue-600">{record.to_teacher_name}</span> สอนแทน</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="text-[10px] font-extrabold text-emerald-400 uppercase mb-1">🟢 คาบที่รับเข้า (B→A)</div>
          <div className="font-extrabold text-sm text-emerald-800">{record.to_day} คาบ {record.to_slot_id}</div>
          <div className="text-xs text-slate-500 mt-0.5">{record.to_subject_name}</div>
          <div className="text-xs text-emerald-400">{record.to_classroom_name}</div>
          <div className="text-[10px] text-slate-400 mt-1 border-t border-emerald-100 pt-1">A ไปสอนแทน <span className="font-bold text-emerald-600">{record.to_teacher_name}</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── Print Modal ─────────────────────────────────────────────
function PrintModal({ mode, history, termInfo, teacherId, allTeachers, onClose }: {
  mode: "teacher"|"overview";
  history: SwapHistory[];
  termInfo: {year:number;semester:string};
  teacherId: string;
  allTeachers: {id:string;full_name:string;department?:string}[];
  onClose: ()=>void;
}) {
  const teacherRecords = history.filter(h => h.requester_id===teacherId || h.to_teacher_id===teacherId);
  const teacherName = allTeachers.find(t=>t.id===teacherId)?.full_name || "ครู";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="print-area bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-4">
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-extrabold text-slate-800">
            {mode==="teacher" ? `🖨️ ใบสรุปการแลกคาบ — ${teacherName}` : "🖨️ รายงานภาพรวมการแลกคาบ"}
          </h2>
          <div className="flex gap-2">
            <button onClick={()=>window.print()} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700">🖨️ พิมพ์ / บันทึก PDF</button>
            <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200">✕ ปิด</button>
          </div>
        </div>
        <div className="p-8 print:p-6" style={{fontFamily:"'Sarabun', sans-serif"}}>
          <div className="text-center mb-6 border-b-2 border-slate-300 pb-4">
            <div className="text-xl font-extrabold text-slate-900">
              {mode==="teacher" ? "ใบสรุปการแลกคาบสอน" : "รายงานภาพรวมการแลกคาบสอน"}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              ปีการศึกษา {termInfo.year} ภาคเรียนที่ {termInfo.semester}
              {mode==="teacher" && <span className="ml-2">· {teacherName}</span>}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              พิมพ์เมื่อ {new Date().toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}
            </div>
          </div>

          {mode==="teacher" ? (
            <div>
              {teacherRecords.length===0 ? (
                <p className="text-center text-slate-400 py-8">ไม่มีประวัติการแลกคาบ</p>
              ) : (
                <>
                  <div className="mb-6">
                    <div className="text-sm font-extrabold text-slate-600 mb-3">📋 รายการการแลกทั้งหมด</div>
                    <table style={{borderCollapse:"collapse",width:"100%",fontSize:"11px"}}>
                      <thead>
                        <tr style={{background:"#f8fafc"}}>
                          {["ครั้งที่","วันที่","คาบที่แลกออก","คาบที่รับเข้า/ต้องคืน","ครูที่เกี่ยวข้อง"].map(h=>(
                            <th key={h} style={{border:"1px solid #e2e8f0",padding:"6px 8px",textAlign:"left",color:"#64748b",fontWeight:700}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teacherRecords.map((h,i)=>(
                          <tr key={h.id} style={{background:i%2===0?"white":"#f8fafc"}}>
                            <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",textAlign:"center",color:"#94a3b8"}}>{i+1}</td>
                            <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",color:"#64748b",fontSize:"10px"}}>
                              {new Date(h.created_at).toLocaleDateString("th-TH",{day:"numeric",month:"short"})}
                            </td>
                            <td style={{border:"1px solid #e2e8f0",padding:"6px 8px"}}>
                              <div style={{fontWeight:700,color:"#1d4ed8"}}>{h.from_day} คาบ {h.from_slot_id}</div>
                              <div style={{color:"#64748b",fontSize:"10px"}}>{h.from_subject_name} · {h.from_classroom_name}</div>
                            </td>
                            <td style={{border:"1px solid #e2e8f0",padding:"6px 8px"}}>
                              <div style={{fontWeight:700,color:"#059669"}}>{h.to_day} คาบ {h.to_slot_id}</div>
                              <div style={{color:"#64748b",fontSize:"10px"}}>{h.to_subject_name} · {h.to_classroom_name}</div>
                            </td>
                            <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",color:"#64748b",fontSize:"10px"}}>
                              {h.requester_id===teacherId ? `สอนแทนโดย ${h.to_teacher_name}` : `สอนแทน ${h.requester_name}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* ─── ตารางสรุปรายสัปดาห์ ─── */}
                  <div style={{marginTop:"24px",marginBottom:"24px"}}>
                    <div style={{fontSize:"13px",fontWeight:700,color:"#475569",marginBottom:"8px"}}>📅 ตารางสรุปการแลกคาบ</div>
                    <table style={{borderCollapse:"collapse",width:"100%",fontSize:"10px"}}>
                      <thead>
                        <tr style={{background:"#f8fafc"}}>
                          <th style={{border:"1px solid #e2e8f0",padding:"4px 6px",color:"#94a3b8",width:"60px",textAlign:"center"}}>วัน</th>
                          {[1,2,3,4,5,6,7].map(s=>(
                            <th key={s} style={{border:"1px solid #e2e8f0",padding:"4px 2px",color:"#64748b",textAlign:"center",fontWeight:600}}>
                              <div>คาบ {s}</div>
                              <div style={{fontSize:"8px",color:"#94a3b8",fontWeight:400}}>
                                {({1:"08:30",2:"09:20",3:"10:25",4:"11:15",5:"13:00",6:"14:00",7:"14:50"} as Record<number,string>)[s]}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์"].map(day=>(
                          <tr key={day}>
                            <td style={{border:"1px solid #e2e8f0",padding:"4px 6px",background:"#f8fafc",fontWeight:700,color:"#475569",textAlign:"center",fontSize:"10px"}}>{day}</td>
                            {[1,2,3,4,5,6,7].map(slot=>{
                              // หา swap record ที่เกี่ยวข้องกับวัน+คาบนี้
                              const swapOut = teacherRecords.find(h=>
                                h.requester_id===teacherId &&
                                h.from_day===day && h.from_slot_id===slot
                              );
                              const swapIn = teacherRecords.find(h=>
                                h.to_teacher_id===teacherId &&
                                h.from_day===day && h.from_slot_id===slot
                              );
                              const goTeach = teacherRecords.find(h=>
                                h.requester_id===teacherId &&
                                h.to_day===day && h.to_slot_id===slot
                              );
                              const comeTeach = teacherRecords.find(h=>
                                h.to_teacher_id===teacherId &&
                                h.to_day===day && h.to_slot_id===slot
                              );
                              if (swapOut) return (
                                <td key={slot} style={{border:"1px solid #e2e8f0",padding:"2px",height:"56px",verticalAlign:"top"}}>
                                  <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:"4px",padding:"2px 4px",height:"100%"}}>
                                    <div style={{fontSize:"8px",color:"#2563eb",fontWeight:700}}>แลกออก →</div>
                                    <div style={{fontSize:"9px",color:"#1e40af",fontWeight:700,lineHeight:1.2}}>{swapOut.from_subject_name}</div>
                                    <div style={{fontSize:"8px",color:"#3b82f6"}}>{swapOut.from_classroom_name}</div>
                                    <div style={{fontSize:"7px",color:"#60a5fa",marginTop:"1px"}}>B: {swapOut.to_teacher_name}</div>
                                  </div>
                                </td>
                              );
                              if (goTeach) return (
                                <td key={slot} style={{border:"1px solid #e2e8f0",padding:"2px",height:"56px",verticalAlign:"top"}}>
                                  <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:"4px",padding:"2px 4px",height:"100%"}}>
                                    <div style={{fontSize:"8px",color:"#16a34a",fontWeight:700}}>← ไปสอนแทน</div>
                                    <div style={{fontSize:"9px",color:"#14532d",fontWeight:700,lineHeight:1.2}}>{goTeach.to_subject_name}</div>
                                    <div style={{fontSize:"8px",color:"#22c55e"}}>{goTeach.to_classroom_name}</div>
                                  </div>
                                </td>
                              );
                              return (
                                <td key={slot} style={{border:"1px solid #e2e8f0",padding:"2px",height:"56px",background:"white"}}/>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{display:"flex",gap:"16px",marginTop:"6px",fontSize:"9px"}}>
                      <span style={{display:"flex",alignItems:"center",gap:"4px"}}>
                        <span style={{width:"12px",height:"12px",background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:"2px",display:"inline-block"}}/>
                        <span style={{color:"#2563eb",fontWeight:600}}>แลกออก (B มาสอนแทน)</span>
                      </span>
                      <span style={{display:"flex",alignItems:"center",gap:"4px"}}>
                        <span style={{width:"12px",height:"12px",background:"#dcfce7",border:"1px solid #86efac",borderRadius:"2px",display:"inline-block"}}/>
                        <span style={{color:"#16a34a",fontWeight:600}}>ไปสอนแทน B</span>
                      </span>
                    </div>
                  </div>

                  <div style={{marginTop:"40px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"24px"}}>
                    {([
                      ["ครู A (ผู้แลกออก)", teacherName],
                      ["ครู B (ผู้รับสอนแทน)", ""],
                      ["ผู้อนุมัติ / หัวหน้ากลุ่มสาระ", ""],
                    ] as [string,string][]).map(([role,name])=>(
                      <div key={role} style={{textAlign:"center"}}>
                        <div style={{borderTop:"1px solid #475569",paddingTop:"8px",marginTop:"48px"}}>
                          <div style={{fontWeight:700,color:"#1e293b",fontSize:"12px"}}>
                            {name || "................................"}
                          </div>
                          <div style={{fontSize:"11px",color:"#64748b",marginTop:"4px"}}>{role}</div>
                          <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px"}}>
                            วันที่ ........../........../..........
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-4 flex gap-6 text-sm">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-extrabold text-indigo-600">{history.length}</div>
                  <div className="text-slate-500">การแลกทั้งหมด</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-extrabold text-emerald-600">
                    {new Set(history.map(h=>h.requester_id)).size}
                  </div>
                  <div className="text-slate-500">ครูที่เกี่ยวข้อง</div>
                </div>
              </div>
              <table style={{borderCollapse:"collapse",width:"100%",fontSize:"11px"}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["#","วันที่","ครู A (ผู้แลก)","ครู A ต้องสอนแทน B","ครู B (รับแทน)","ครู B ต้องสอนแทน A"].map(h=>(
                      <th key={h} style={{border:"1px solid #e2e8f0",padding:"6px 8px",textAlign:"left",color:"#64748b",fontWeight:700,fontSize:"12px"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h,i)=>(
                    <tr key={h.id} style={{background:i%2===0?"white":"#f8fafc"}}>
                      <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",textAlign:"center",color:"#94a3b8",fontSize:"10px"}}>{i+1}</td>
                      <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",color:"#64748b",fontSize:"10px",whiteSpace:"nowrap"}}>
                        {new Date(h.created_at).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"})}
                      </td>
                      {/* ครู A */}
                      <td style={{border:"1px solid #e2e8f0",padding:"6px 8px"}}>
                        <div style={{fontWeight:700,color:"#1e293b",fontSize:"13px"}}>
                          {h.requester_name && h.requester_name.trim()
                            ? h.requester_name
                            : allTeachers.find(t=>t.id===h.requester_id)?.full_name || "-"}
                        </div>
                        <div style={{color:"#94a3b8",fontSize:"11px",marginTop:"2px"}}>แลกออก: {h.from_day} คาบ {h.from_slot_id}</div>
                        <div style={{color:"#64748b",fontSize:"11px"}}>{h.from_subject_name}</div>
                        <div style={{color:"#94a3b8",fontSize:"11px"}}>{h.from_classroom_name}</div>
                      </td>
                      {/* A ต้องไปสอนแทน B (คาบของ B) */}
                      <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",background:"#eff6ff"}}>
                        <div style={{fontSize:"11px",color:"#3b82f6",fontWeight:700,marginBottom:"2px"}}>ไปสอนที่ห้อง B แทน</div>
                        <div style={{fontWeight:700,color:"#1d4ed8",fontSize:"13px"}}>{h.to_day} คาบ {h.to_slot_id}</div>
                        <div style={{color:"#64748b",fontSize:"11px"}}>{h.to_subject_name}</div>
                        <div style={{color:"#94a3b8",fontSize:"11px"}}>{h.to_classroom_name}</div>
                      </td>
                      {/* ครู B */}
                      <td style={{border:"1px solid #e2e8f0",padding:"6px 8px"}}>
                        <div style={{fontWeight:700,color:"#1e293b",fontSize:"13px"}}>{h.to_teacher_name}</div>
                        <div style={{color:"#94a3b8",fontSize:"11px",marginTop:"2px"}}>แลกออก: {h.to_day} คาบ {h.to_slot_id}</div>
                        <div style={{color:"#64748b",fontSize:"11px"}}>{h.to_subject_name}</div>
                        <div style={{color:"#94a3b8",fontSize:"11px"}}>{h.to_classroom_name}</div>
                      </td>
                      {/* B ต้องไปสอนแทน A (คาบของ A) */}
                      <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",background:"#f0fdf4"}}>
                        <div style={{fontSize:"11px",color:"#16a34a",fontWeight:700,marginBottom:"2px"}}>มาสอนที่ห้อง A แทน</div>
                        <div style={{fontWeight:700,color:"#059669",fontSize:"13px"}}>{h.from_day} คาบ {h.from_slot_id}</div>
                        <div style={{color:"#64748b",fontSize:"11px"}}>{h.from_subject_name}</div>
                        <div style={{color:"#94a3b8",fontSize:"11px"}}>{h.from_classroom_name}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            {/* ลายเซ็นภาพรวม */}
            <div style={{marginTop:"48px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"32px"}}>
              {[
                ["ครู A (ผู้แลกออก)",""],
                ["ครู B (ผู้รับสอนแทน)",""],
                ["ผู้อนุมัติ / หัวหน้ากลุ่มสาระ",""],
              ].map(([role])=>(
                <div key={role} style={{textAlign:"center"}}>
                  <div style={{borderTop:"1px solid #475569",paddingTop:"8px",marginTop:"48px"}}>
                    <div style={{fontWeight:700,color:"#1e293b",fontSize:"12px"}}>................................</div>
                    <div style={{fontSize:"11px",color:"#64748b",marginTop:"4px"}}>{role}</div>
                    <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px"}}>วันที่ ........../........../..........
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            background: white !important;
            z-index: 9999 !important;
          }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function SwapPeriods() {
  const [session,      setSession]      = useState<any>(null);
  const [mounted,      setMounted]      = useState(false);
  const [termInfo,     setTermInfo]     = useState<{year:number,semester:string}>({year:2569,semester:"1"});
  const [allTeachers,  setAllTeachers]  = useState<{id:string,full_name:string,department?:string}[]>([]);

  // ── ข้อมูลตารางสอนทั้งหมด (read-only, ไม่เคยถูกแก้ไข) ──
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);
  // ── ประวัติการแลก (source of truth ของการแลก) ──
  const [swapHistory,    setSwapHistory]    = useState<SwapHistory[]>([]);

  // Step state
  const [step, setStep] = useState<Step>(1);
  const [tab,  setTab]  = useState<"swap"|"history">("swap");

  // Step 1
  const [teacherAId,      setTeacherAId]      = useState("");
  const [teacherAPeriods, setTeacherAPeriods] = useState<Assignment[]>([]);

  // Step 2
  const [selectedPeriod, setSelectedPeriod] = useState<Assignment|null>(null);
  const [options,        setOptions]        = useState<SwapOption[]>([]);
  const [isSearching,    setIsSearching]    = useState(false);
  const [showAll,        setShowAll]        = useState(false);

  // Step 3
  const [chosenOption, setChosenOption] = useState<SwapOption|null>(null);

  // Misc
  const [isLoading,        setIsLoading]        = useState(false);
  const [toast,            setToast]            = useState<{msg:string;type:"success"|"error"}|null>(null);
  const [expandedHistoryId,setExpandedHistoryId]= useState<number|null>(null);
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<number|null>(null);
  const [deletingId,       setDeletingId]       = useState<number|null>(null);
  const [printMode,        setPrintMode]        = useState<"teacher"|"overview"|null>(null);
  const [printTeacherId,   setPrintTeacherId]   = useState("");

  const fuzzyGrouped  = useMemo(()=>fuzzyGroupTeachers(allTeachers,0.8),[allTeachers]);
  const teacherAName  = allTeachers.find(t=>t.id===teacherAId)?.full_name||"";
  const groupedPeriods = useMemo(()=>{
    const g:Record<string,Assignment[]>={};
    for (const d of DAYS) g[d]=teacherAPeriods.filter(p=>p.day_of_week===d).sort((a,b)=>a.slot_id-b.slot_id);
    return g;
  },[teacherAPeriods]);

  const displayedOptions = showAll ? options : options.slice(0,4);

  function showToast(msg:string,type:"success"|"error"="success"){
    setToast({msg,type}); setTimeout(()=>setToast(null),3500);
  }

  // ─── Load initial data ────────────────────────────────────
  // โหลด termInfo ก่อน (await) แล้วค่อย loadAllData ด้วยค่าจริงจาก DB ทันที
  // วิธีนี้ป้องกัน race condition ที่ useEffect([termInfo]) จะ fire ด้วยค่า default ก่อน
  useEffect(()=>{
    setMounted(true);
    const saved = localStorage.getItem("teacher_session");
    if (saved) { try { setSession(JSON.parse(saved)); } catch(e) {} }
    supabase.from("teachers").select("id,full_name,department").order("department").order("full_name")
      .then(({data})=>{ if(data) setAllTeachers(data); });
    loadInitialData();
  },[]);

  async function loadInitialData() {
    const { data: settings } = await supabase
      .from("academic_settings").select("*").single();
    console.log("[SwapPeriods] academic_settings →", settings);
    const yr  = Number(settings?.year  ?? 2569);
    const raw = String(settings?.semester ?? "1");
    // DB อาจเก็บ semester เป็น "3" หรือ "Summer" — รองรับทั้งสองแบบ
    const sm  = raw === "3" ? "Summer" : raw;
    console.log("[SwapPeriods] termInfo resolved →", { yr, raw, sm });
    setTermInfo({ year: yr, semester: sm });
    await loadAllData(yr, sm);
  }

  // รับ yr/sm ตรง เพื่อไม่ต้องพึ่ง termInfo state ที่อาจยัง stale
  async function loadAllData(yr?: number, sm?: string) {
    const year = yr ?? termInfo.year;
    const sem  = sm ?? termInfo.semester;
    const semVariants = sem === "Summer" ? ["Summer","3"] : [sem];
    const [{data:assigns},{data:swaps}] = await Promise.all([
      // READ ONLY — ไม่มีการ update/insert/delete ที่ teaching_assignments เลย
      supabase.from("teaching_assignments")
        .select("*,subjects(code,name),classrooms(name),teachers(full_name)")
        .eq("academic_year", year)
        .in("semester", semVariants),
      supabase.from("swap_history")
        .select("*")
        .eq("academic_year", year)
        .eq("semester", sem)
        .order("created_at",{ascending:false})
        .limit(200),
    ]);
    const loaded = (assigns ?? []) as Assignment[];
    console.log("[SwapPeriods] loadAllData →", { year, sem, semVariants, assignCount: loaded.length, swapCount: (swaps??[]).length });
    if (assigns) setAllAssignments(loaded);
    if (swaps)   setSwapHistory(swaps as SwapHistory[]);
    return loaded; // คืนค่าให้ handleSelectTeacherA ใช้ได้ทันที
  }

  // ─── Step 1: เลือกครู ─────────────────────────────────────
  // Query ตรงจาก DB เสมอ ไม่พึ่ง state ที่อาจ stale
  async function handleSelectTeacherA(id:string) {
    setTeacherAId(id);
    setSelectedPeriod(null); setOptions([]); setChosenOption(null); setStep(1);
    if (!id) { setTeacherAPeriods([]); return; }

    // ดึงตรงจาก DB ด้วย termInfo ปัจจุบัน — ไม่รอ state settle
    const { data: settings } = await supabase
      .from("academic_settings").select("*").single();
    const yr  = Number(settings?.year  ?? termInfo.year);
    const raw = String(settings?.semester ?? termInfo.semester);
    const sm  = raw === "3" ? "Summer" : raw;
    const semVariants = sm === "Summer" ? ["Summer","3"] : [sm];

    console.log("[SwapPeriods] handleSelectTeacherA query →", { id, yr, sm, semVariants });

    const { data: assigns } = await supabase
      .from("teaching_assignments")
      .select("*,subjects(code,name),classrooms(name),teachers(full_name)")
      .eq("teacher_id", id)
      .eq("academic_year", yr)
      .in("semester", semVariants);

    const periods = (assigns ?? []) as Assignment[];
    console.log("[SwapPeriods] periods found →", periods.length,
      "semesters:", [...new Set(periods.map(p=>p.semester))]);

    // อัพเดต allAssignments ด้วยถ้า state ยัง empty
    if (allAssignments.length === 0) {
      await loadAllData(yr, sm);
    }

    setTeacherAPeriods(periods);
    if (periods.length > 0) setStep(2);
  }


  // ─── Step 2: เลือกคาบ ─────────────────────────────────────
  async function handleSelectPeriod(period:Assignment) {
    setSelectedPeriod(period); setOptions([]); setChosenOption(null);
    setShowAll(false); setIsSearching(true); setStep(2);

    // สร้าง "ตารางสอนจริง" ของ A หลัง overlay swap_history
    // ยกเว้นคาบที่กำลังจะแลก
    const aEffectiveBusy = resolveTeacherEffectiveSlots(teacherAId, allAssignments, swapHistory);
    aEffectiveBusy.delete(`${period.day_of_week}-${period.slot_id}`); // เอาคาบนี้ออก เพราะจะแลกมันออกไป
    const aSlotKey = `${period.day_of_week}-${period.slot_id}`;

    // หาครู B ที่อยู่ในห้องเดียวกันกับ A (ไม่จำเป็นต้องคาบเดียวกัน)
    const sameRoomAssigns = allAssignments.filter(a =>
      a.classroom_id === period.classroom_id &&
      a.teacher_id !== teacherAId
    );
    if (!sameRoomAssigns.length) {
      showToast("ไม่พบครูคนอื่นในห้องเดียวกัน","error");
      setIsSearching(false); return;
    }

    const teacherBIds = [...new Set(sameRoomAssigns.map(a=>a.teacher_id).filter(Boolean))];
    const result: SwapOption[] = [];

    for (const bId of teacherBIds) {
      // ตารางสอนจริงของ B หลัง overlay
      const bEffectiveBusy = resolveTeacherEffectiveSlots(bId, allAssignments, swapHistory);

      // คาบของ B ที่อยู่ในห้องเดียวกัน (candidates ที่จะแลกด้วย)
      // กรองออก: คาบที่เป็นวันเดียวกันกับคาบที่จะแลก (ห้ามแลกในวันเดียวกัน)
      const bCandidates = sameRoomAssigns.filter(a =>
        a.teacher_id === bId &&
        !a.is_locked &&
        a.day_of_week !== period.day_of_week
      );

      const teacherBInfo = allTeachers.find(t=>t.id===bId) ||
        {id:bId, full_name:sameRoomAssigns.find(a=>a.teacher_id===bId)?.teachers?.full_name||"-", department:""};

      for (const bc of bCandidates) {
        const bCandidateSlotKey = `${bc.day_of_week}-${bc.slot_id}`;

        // ตรวจทิศทางที่ 1: A ว่างในคาบของ B (A ไปสอนแทน B ได้)
        const aCanTakeBSlot = !aEffectiveBusy.has(bCandidateSlotKey);

        // ตรวจทิศทางที่ 2: B ว่างในคาบของ A (B มาสอนแทน A ได้)
        // ต้องเอาคาบของ B เอง (bCandidateSlotKey) ออกก่อน เพราะหลังแลก B จะไม่สอนคาบนั้นแล้ว
        const bBusyWithoutOwn = new Set([...bEffectiveBusy]);
        bBusyWithoutOwn.delete(bCandidateSlotKey);
        const bCanTakeASlot = !bBusyWithoutOwn.has(aSlotKey);

        if (aCanTakeBSlot && bCanTakeASlot) {
          result.push({ assignment: bc as Assignment, teacherB: teacherBInfo, bothWayOk: true });
        }
      }
    }

    result.sort((a,b)=>{
      const sameA = a.assignment.classroom_id===period.classroom_id?0:1;
      const sameB = b.assignment.classroom_id===period.classroom_id?0:1;
      if (sameA!==sameB) return sameA-sameB;
      return DAYS.indexOf(a.assignment.day_of_week)-DAYS.indexOf(b.assignment.day_of_week)||
        a.assignment.slot_id-b.assignment.slot_id;
    });

    setOptions(result);
    setIsSearching(false);
    if (result.length>0) setStep(3);
    else showToast("ไม่พบคาบที่แลกได้โดยไม่ชนตารางทั้งสองฝ่าย","error");
  }

  function handleChooseOption(opt:SwapOption) {
    setChosenOption(opt); setStep(4);
    setTimeout(()=>{ document.getElementById("confirm-section")?.scrollIntoView({behavior:"smooth"}); },100);
  }

  // ─── Confirm swap: เขียนแค่ swap_history เท่านั้น ──────────
  // teaching_assignments ไม่ถูกแตะเลย
  async function handleConfirmSwap() {
    if (!selectedPeriod||!chosenOption||!session) return;
    setIsLoading(true);
    try {
      // requester = ครู A ที่เลือกในขั้นตอนที่ 1 เสมอ (teacherAName คำนวณจาก allTeachers+teacherAId)
      const { error } = await supabase.from("swap_history").insert([{
        requester_id:    teacherAId,
        requester_name:  teacherAName,
        from_day:        selectedPeriod.day_of_week,
        from_slot_id:    selectedPeriod.slot_id,
        from_classroom_id:   selectedPeriod.classroom_id,
        from_classroom_name: selectedPeriod.classrooms?.name || "-",
        from_subject_id:     selectedPeriod.subject_id,
        from_subject_name:   selectedPeriod.subjects?.name  || "-",
        to_day:          chosenOption.assignment.day_of_week,
        to_slot_id:      chosenOption.assignment.slot_id,
        to_classroom_id:     chosenOption.assignment.classroom_id,
        to_classroom_name:   chosenOption.assignment.classrooms?.name || "-",
        to_subject_id:       chosenOption.assignment.subject_id,
        to_subject_name:     chosenOption.assignment.subjects?.name  || "-",
        to_teacher_id:   chosenOption.teacherB.id,
        to_teacher_name: chosenOption.teacherB.full_name,
        academic_year:   Number(termInfo.year),
        semester:        termInfo.semester,
      }]);

      if (error) throw error;

      showToast("✅ บันทึกการแลกคาบสำเร็จ!");

      // รีเฟรช swapHistory ใน state (ไม่ต้อง reload allAssignments เพราะไม่ได้แก้)
      await loadAllData();

      setStep(1); setTeacherAId(""); setTeacherAPeriods([]);
      setSelectedPeriod(null); setOptions([]); setChosenOption(null);
    } catch(err:any) {
      showToast("เกิดข้อผิดพลาด: "+err.message,"error");
    } finally {
      setIsLoading(false);
    }
  }

  // ─── ลบประวัติ: แค่ลบ swap_history record ────────────────
  // ไม่ต้อง undo ใน teaching_assignments เพราะไม่เคยแก้มัน
  async function handleDeleteHistory(h:SwapHistory) {
    setDeletingId(h.id);
    try {
      const { error } = await supabase.from("swap_history").delete().eq("id",h.id);
      if (error) throw error;
      showToast("↩️ ยกเลิกการแลกแล้ว — ตารางสอนกลับเป็นเดิมโดยอัตโนมัติ");
      setSwapHistory(prev=>prev.filter(r=>r.id!==h.id));
    } catch(err:any) {
      showToast("เกิดข้อผิดพลาด: "+err.message,"error");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function loadHistory() {
    const { data } = await supabase.from("swap_history").select("*")
      .eq("academic_year",Number(termInfo.year)).eq("semester",termInfo.semester)
      .order("created_at",{ascending:false}).limit(50);
    if (data) setSwapHistory(data as SwapHistory[]);
  }

  // รอ client mount ก่อน — ป้องกัน SSR แสดง lock screen ผิดพลาดบน Vercel
  if (!mounted) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center p-8">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-slate-600 mb-4">กรุณา login ก่อนใช้งาน</p>
        <Link href="/" className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700">ไปหน้า Login</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800" style={{fontSize:"17px"}}>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium
          ${toast.type==="success"?"bg-emerald-500":"bg-red-500"}`}>{toast.msg}</div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">🔄 ระบบแลกคาบสอน</h1>
            <p className="text-slate-400 text-sm mt-0.5">ปี {termInfo.year} เทอม {termInfo.semester}</p>
          </div>
          <Link href="/" className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 shadow-sm">⬅ กลับ</Link>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">ℹ️</span>
          <span>ระบบนี้ <strong>ไม่แก้ตารางสอนจริง</strong> — บันทึกเฉพาะ "บันทึกการแลก" ไว้ใน swap_history การยกเลิกแค่ลบ record นั้นออก ตารางสอนเดิมยังคงเดิมเสมอ</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {([["swap","🔄 แลกคาบ"],["history","📋 ประวัติ"]] as const).map(([v,l])=>(
            <button key={v} onClick={()=>{ setTab(v); if(v==="history") loadHistory(); }}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition
                ${tab===v?"bg-indigo-600 text-white shadow":"text-slate-500 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </div>

        {/* ══════════════════ TAB: SWAP ══════════════════ */}
        {tab==="swap" && (<>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[{n:1,label:"เลือกครู"},{n:2,label:"เลือกคาบ"},{n:3,label:"เลือกการแลก"},{n:4,label:"ยืนยัน"}].map((s,i)=>(
              <div key={s.n} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold transition
                  ${step>s.n?"bg-emerald-500 text-white":step===s.n?"bg-indigo-600 text-white":"bg-slate-200 text-slate-400"}`}>
                  {step>s.n?"✓":s.n}
                </div>
                <span className={`text-xs font-semibold hidden sm:block ${step===s.n?"text-indigo-600":"text-slate-400"}`}>{s.label}</span>
                {i<3 && <div className={`h-0.5 w-6 ${step>s.n?"bg-emerald-400":"bg-slate-200"}`}/>}
              </div>
            ))}
          </div>

          {/* ── STEP 1 ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">ขั้นตอนที่ 1</div>
              <h2 className="text-lg font-extrabold text-slate-800">เลือกครูที่ต้องการแลกคาบ</h2>
              <p className="text-sm text-slate-400 mt-0.5">เช่น ครูที่ป่วย หรืออยากย้ายคาบสอน</p>
            </div>
            <div className="px-6 py-5">
              <select value={teacherAId} onChange={e=>handleSelectTeacherA(e.target.value)}
                className="w-full p-4 text-base font-bold border-2 border-indigo-300 rounded-2xl bg-indigo-50 outline-none focus:ring-4 ring-indigo-100 appearance-none cursor-pointer"
                style={{fontSize:"17px"}}>
                <option value="">— เลือกชื่อครู —</option>
                {fuzzyGrouped.map(([dept,list])=>(
                  <optgroup key={dept} label={`📂 ${dept}`}>
                    {list.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </optgroup>
                ))}
              </select>
              {!teacherAId && allAssignments.length===0 && (
                <p className="text-center text-slate-400 text-sm mt-3">⏳ กำลังโหลดข้อมูล...</p>
              )}
              {teacherAId && teacherAPeriods.length===0 && (
                <p className="text-center text-slate-400 text-sm mt-3">ครูท่านนี้ไม่มีคาบสอนในเทอมนี้</p>
              )}
            </div>
          </div>

          {/* ── STEP 2 ── */}
          {teacherAId && teacherAPeriods.length>0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">ขั้นตอนที่ 2</div>
                <h2 className="text-lg font-extrabold text-slate-800">เลือกคาบที่ต้องการแลกออก</h2>
                <p className="text-sm text-slate-400 mt-0.5">ตารางสอนของ <span className="font-bold text-slate-600">{teacherAName}</span>
                  <span className="ml-2 text-xs text-blue-400">(รวมคาบที่รับแทนจากการแลกก่อนหน้า)</span>
                </p>
              </div>
              <div className="px-6 py-5 space-y-5">
                {DAYS.map(day=>groupedPeriods[day].length>0&&(
                  <div key={day}>
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">{day}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {groupedPeriods[day].map(p=>{
                        // ตรวจว่าคาบนี้ถูกแลกออกไปแล้วใน swapHistory หรือเปล่า
                        const alreadySwapped = swapHistory.some(h=>
                          h.from_day===p.day_of_week && h.from_slot_id===p.slot_id &&
                          h.from_classroom_id===p.classroom_id
                        );
                        return (
                          <button key={p.id} onClick={()=>!alreadySwapped&&handleSelectPeriod(p)}
                            disabled={alreadySwapped}
                            className={`text-left p-4 rounded-2xl border-2 transition active:scale-95
                              ${alreadySwapped
                                ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                                : selectedPeriod?.id===p.id
                                  ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                                  : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"}`}>
                            <div className={`text-xs font-bold mb-1 ${selectedPeriod?.id===p.id?"text-indigo-200":"text-slate-400"}`}>
                              คาบ {p.slot_id} · {SLOT_TIME[p.slot_id]}
                            </div>
                            <div className="font-extrabold text-base leading-tight">{p.subjects?.name}</div>
                            <div className={`text-sm mt-1 ${selectedPeriod?.id===p.id?"text-indigo-200":"text-slate-400"}`}>
                              {p.subjects?.code} · ห้อง {p.classrooms?.name}
                            </div>
                            {alreadySwapped && <div className="mt-2 text-xs bg-amber-100 text-amber-700 rounded-lg px-2 py-1 inline-block font-bold">🔄 แลกออกแล้ว</div>}
                            {selectedPeriod?.id===p.id && <div className="mt-2 text-xs bg-white/20 rounded-lg px-2 py-1 inline-block font-bold">👆 เลือกอยู่</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {isSearching && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-8 text-center">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="font-bold text-slate-600">กำลังค้นหาคาบที่แลกได้...</p>
              <p className="text-sm text-slate-400 mt-1">ตรวจสอบทั้ง 2 ทิศทาง ไปและกลับ</p>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {!isSearching && selectedPeriod && options.length>0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">ขั้นตอนที่ 3</div>
                <h2 className="text-lg font-extrabold text-slate-800">เลือกคาบที่จะแลกด้วย</h2>
                <p className="text-sm text-slate-400 mt-0.5">ทุกตัวเลือกนี้ <span className="text-emerald-600 font-bold">ไป-กลับ ไม่ชนตารางทั้งสองฝ่าย ✅</span></p>
              </div>

              <div className="mx-6 mt-5 bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 flex items-center gap-4">
                <div className="text-2xl">📌</div>
                <div>
                  <div className="text-xs font-bold text-indigo-400 uppercase mb-0.5">คาบที่จะแลกออก</div>
                  <div className="font-extrabold text-base">{selectedPeriod.day_of_week} คาบ {selectedPeriod.slot_id} · {selectedPeriod.subjects?.name}</div>
                  <div className="text-sm text-indigo-400">{teacherAName} · ห้อง {selectedPeriod.classrooms?.name}</div>
                </div>
              </div>

              <div className="px-6 py-5">
                <div className="text-sm font-bold text-emerald-600 mb-4">✅ พบ {options.length} คาบที่แลกได้ — เรียงจากดีที่สุด</div>
                <div className="space-y-3">
                  {displayedOptions.map((opt,idx)=>(
                    <button key={opt.assignment.id} onClick={()=>handleChooseOption(opt)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition active:scale-[0.99] flex items-center gap-4
                        ${chosenOption?.assignment.id===opt.assignment.id
                          ?"border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                          :"border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"}`}>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0
                        ${idx===0?"bg-yellow-100":"bg-emerald-100"}`}>
                        {idx===0?"⭐":"✅"}
                      </div>
                      <div className="flex-1 min-w-0">
                        {idx===0&&<div className="text-xs font-extrabold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full inline-block mb-1">แนะนำอันดับ 1</div>}
                        <div className="text-sm text-slate-500">{opt.assignment.day_of_week} คาบ {opt.assignment.slot_id} · {SLOT_TIME[opt.assignment.slot_id]}</div>
                        <div className="font-extrabold text-base leading-tight">{opt.assignment.subjects?.name}</div>
                        <div className="text-sm text-slate-500 mt-0.5">👤 {opt.teacherB.full_name} · ห้อง {opt.assignment.classrooms?.name}</div>
                        <div className="flex gap-3 mt-2 text-xs font-bold text-emerald-600">
                          <span>✓ {teacherAName} ว่างคาบนั้น</span>
                          <span>✓ {opt.teacherB.full_name} ว่างคาบนี้</span>
                        </div>
                      </div>
                      <div className={`text-2xl font-extrabold flex-shrink-0 ${chosenOption?.assignment.id===opt.assignment.id?"text-emerald-500":"text-slate-300"}`}>
                        {chosenOption?.assignment.id===opt.assignment.id?"✓":"→"}
                      </div>
                    </button>
                  ))}
                </div>
                {options.length>4&&!showAll&&(
                  <button onClick={()=>setShowAll(true)}
                    className="w-full mt-3 py-3 text-sm font-bold text-slate-500 hover:text-indigo-600">
                    ดูทั้งหมด {options.length} คาบ ▼
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 4 ── */}
          {chosenOption && selectedPeriod && (
            <div id="confirm-section" className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">ขั้นตอนที่ 4</div>
                <h2 className="text-lg font-extrabold text-slate-800">ยืนยันการแลกคาบ</h2>
              </div>
              <div className="px-6 py-5">
                <SwapTimetable
                  teacherAPeriods={teacherAPeriods}
                  teacherBOption={chosenOption}
                  selectedPeriod={selectedPeriod}
                  teacherAName={teacherAName}
                  swapHistory={swapHistory}
                  allAssignments={allAssignments}
                />

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 space-y-2">
                  <div className="text-xs font-extrabold text-slate-500 uppercase mb-2">✅ ตรวจสอบ 2 ทิศทางแล้ว</div>
                  <div className="flex items-start gap-3 text-sm">
                    <span className="text-blue-500 font-bold shrink-0">→</span>
                    <span><strong>{chosenOption.teacherB.full_name}</strong> ว่างในวัน{selectedPeriod.day_of_week} คาบ {selectedPeriod.slot_id} — <span className="text-emerald-600 font-bold">รับสอนแทนได้</span></span>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <span className="text-emerald-500 font-bold shrink-0">←</span>
                    <span><strong>{teacherAName}</strong> ว่างในวัน{chosenOption.assignment.day_of_week} คาบ {chosenOption.assignment.slot_id} — <span className="text-emerald-600 font-bold">กลับมาคืนคาบได้</span></span>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 mb-4">
                  ✅ ระบบจะ<strong>บันทึก swap_history เท่านั้น</strong> — ตารางสอนจริงไม่เปลี่ยนแปลง การยกเลิกแค่ลบ record นี้ออก
                </div>

                <div className="flex gap-3">
                  <button onClick={()=>{setChosenOption(null);setStep(3);}}
                    className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-base">
                    ← ย้อนกลับ
                  </button>
                  <button onClick={handleConfirmSwap} disabled={isLoading}
                    className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white font-extrabold hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200 text-base">
                    {isLoading?"กำลังบันทึก...":"✅ ยืนยันบันทึกการแลก"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </>)}

        {/* ══════════════════ TAB: HISTORY ══════════════════ */}
        {tab==="history" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-slate-800 text-lg">📋 ประวัติการแลกคาบ</h2>
                <p className="text-xs text-slate-400 mt-0.5">ปี {termInfo.year} เทอม {termInfo.semester} · {swapHistory.length} รายการ</p>
              </div>
              <button onClick={()=>setPrintMode("overview")}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-sm font-bold border border-indigo-200">
                🖨️ พิมพ์รายงาน
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {swapHistory.length===0 ? (
                <div className="py-12 text-center text-slate-400">ยังไม่มีประวัติการแลกคาบ</div>
              ) : swapHistory.map(h=>(
                <div key={h.id}>
                  <div className="px-6 py-4 hover:bg-slate-50 flex items-start gap-3">
                    <button onClick={()=>setExpandedHistoryId(expandedHistoryId===h.id?null:h.id)}
                      className="flex-1 text-left space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800">{h.requester_name}</span>
                        <span className="text-slate-400 text-sm">จัดการแลก</span>
                        <span className="text-xs text-slate-300">
                          {new Date(h.created_at).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold">{h.from_day} คาบ {h.from_slot_id}</span>
                        <span className="text-slate-400 font-bold">⇄</span>
                        <span className="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold">{h.to_day} คาบ {h.to_slot_id}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {h.from_subject_name} · ห้อง {h.from_classroom_name}
                        <span className="mx-1">⇄</span>
                        {h.to_subject_name} · ห้อง {h.to_classroom_name}
                        <span className="ml-2 text-slate-300">กับ {h.to_teacher_name}</span>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <button onClick={()=>{setPrintTeacherId(h.requester_id||"");setPrintMode("teacher");}}
                        title="พิมพ์ใบสรุปครู"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-500 text-sm">
                        🖨️
                      </button>
                      {confirmDeleteId===h.id ? (
                        <div className="flex gap-1">
                          <button onClick={()=>handleDeleteHistory(h)} disabled={deletingId===h.id}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 disabled:opacity-50">
                            {deletingId===h.id?"...":"ยืนยัน"}
                          </button>
                          <button onClick={()=>setConfirmDeleteId(null)}
                            className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200">
                            ยกเลิก
                          </button>
                        </div>
                      ):(
                        <button onClick={()=>setConfirmDeleteId(h.id)} title="ยกเลิกการแลก"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-400 text-sm">
                          🗑️
                        </button>
                      )}
                      <button onClick={()=>setExpandedHistoryId(expandedHistoryId===h.id?null:h.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400">
                        <span className={`inline-block transition-transform ${expandedHistoryId===h.id?"rotate-180":""}`}>⌄</span>
                      </button>
                    </div>
                  </div>

                  {expandedHistoryId===h.id && (
                    <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100">
                      <div className="pt-4"><HistoryTimetable record={h}/></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {isLoading && (
        <div className="fixed bottom-5 right-5 bg-white p-3 rounded-xl shadow-xl border flex items-center gap-2 z-40">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"/>
          <span className="text-xs font-bold text-slate-500">กำลังประมวลผล...</span>
        </div>
      )}

      {printMode && (
        <PrintModal
          mode={printMode}
          history={swapHistory}
          termInfo={termInfo}
          teacherId={printTeacherId}
          allTeachers={allTeachers}
          onClose={()=>{setPrintMode(null);setPrintTeacherId("");}}
        />
      )}
    </div>
  );
}