"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from '@/lib/supabaseClient';
import Link from "next/link";
import * as XLSX from 'xlsx';

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const ALL_SLOTS = [
  { id: 1,    label: "คาบ 1", time: "08:30-09:20", start: "08.30", end: "09.20" },
  { id: 2,    label: "คาบ 2", time: "09:20-10:10", start: "09.20", end: "10.10" },
  { id: "p1", label: "พัก",   time: "10:10-10:25", isBreak: true },
  { id: 3,    label: "คาบ 3", time: "10:25-11:15", start: "10.25", end: "11.15" },
  { id: 4,    label: "คาบ 4", time: "11:15-12:05", start: "11.15", end: "12.05" },
  { id: "p2", label: "พักเที่ยง", time: "12:05-13:00", isBreak: true },
  { id: 5,    label: "คาบ 5", time: "13:00-13:50", start: "13.00", end: "13.50" },
  { id: "p3", label: "พัก",   time: "13:50-14:00", isBreak: true },
  { id: 6,    label: "คาบ 6", time: "14:00-14:50", start: "14.00", end: "14.50" },
  { id: 7,    label: "คาบ 7", time: "14:50-15:40", start: "14.50", end: "15.40" },
];
const REAL_SLOTS = ALL_SLOTS.filter(s => !s.isBreak) as { id: number; label: string; time: string; start: string; end: string }[];

const DAY_CONFIG: Record<string, { header: string; cell: string; badge: string }> = {
  "จันทร์":    { header: "bg-yellow-400 text-yellow-900",   cell: "bg-yellow-50 border-yellow-200",  badge: "bg-yellow-200 text-yellow-800" },
  "อังคาร":   { header: "bg-rose-500 text-white",           cell: "bg-rose-50 border-rose-200",       badge: "bg-rose-200 text-rose-800" },
  "พุธ":       { header: "bg-emerald-500 text-white",        cell: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-200 text-emerald-800" },
  "พฤหัสบดี": { header: "bg-orange-400 text-orange-900",    cell: "bg-orange-50 border-orange-200",   badge: "bg-orange-200 text-orange-800" },
  "ศุกร์":    { header: "bg-violet-500 text-white",         cell: "bg-violet-50 border-violet-200",   badge: "bg-violet-200 text-violet-800" },
};

const FONT_SIZES = [
  { label: "A",   name: 11, teacher: 9,  cellH: 90  },
  { label: "A+",  name: 13, teacher: 10, cellH: 108 },
  { label: "A++", name: 15, teacher: 11, cellH: 128 },
];

function naturalSort(a: string, b: string) {
  const parse = (s: string) => {
    const m = s.trim().match(/^(\d+)\/(\d+)/);
    if (m) return { grade: parseInt(m[1]), room: parseInt(m[2]) };
    const m2 = s.trim().match(/^(\d+)/);
    if (m2) return { grade: parseInt(m2[1]), room: 0 };
    return { grade: 0, room: 0 };
  };
  const pa = parse(a), pb = parse(b);
  return pa.grade !== pb.grade ? pa.grade - pb.grade : pa.room - pb.room;
}

export default function ViewScheduleClassroom() {
  const [classrooms, setClassrooms]     = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [assignments, setAssignments]   = useState<any[]>([]);
  const [termInfo, setTermInfo]         = useState({ year: "2569", semester: "3" });
  const [loading, setLoading]           = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [gradeFilter, setGradeFilter]   = useState("all");
  const [fontIdx, setFontIdx]           = useState(0);

  useEffect(() => { loadInitial(); }, []);
  useEffect(() => { if (selectedRoom) fetchSchedule(); else setAssignments([]); }, [selectedRoom, termInfo]);

  async function loadInitial() {
    const [{ data: rooms }, { data: settings }] = await Promise.all([
      supabase.from("classrooms").select("id, name"),
      supabase.from("academic_settings").select("*").single(),
    ]);
    if (rooms) setClassrooms([...rooms].sort((a, b) => naturalSort(a.name, b.name)));
    if (settings) setTermInfo({ year: settings.year?.toString() || "2569", semester: settings.semester || "3" });
  }

  async function fetchSchedule() {
    setLoading(true);
    const { data } = await supabase
      .from("teaching_assignments")
      .select(`*, subjects(name, code), teachers(full_name, teacher_code)`)
      .eq("classroom_id", selectedRoom)
      .eq("academic_year", termInfo.year)
      .eq("semester", termInfo.semester);
    setAssignments(data || []);
    setLoading(false);
  }

  // ── Export Excel (ทุกห้องที่มีข้อมูล) ──
  async function handleExportAll() {
    setExporting(true);
    try {
      // ดึงทุกห้องพร้อมกัน
      const { data: allData } = await supabase
        .from("teaching_assignments")
        .select(`classroom_id, day_of_week, slot_id, activity_type, note,
                 subjects(name, code), teachers(full_name, teacher_code)`)
        .eq("academic_year", termInfo.year)
        .eq("semester", termInfo.semester);

      if (!allData || allData.length === 0) { alert("ไม่พบข้อมูลตารางสอน"); return; }

      const wb = XLSX.utils.book_new();
      const HEADER = ["วัน", "รหัสวิชา", "เริ่มเวลา", "หมดเวลา", "รหัสผู้ใช้งาน(ครูผู้สอน)"];

      // group by classroom
      const byRoom: Record<string, any[]> = {};
      for (const a of allData) {
        if (!byRoom[a.classroom_id]) byRoom[a.classroom_id] = [];
        byRoom[a.classroom_id].push(a);
      }

      for (const classroom of classrooms) {
        const roomData = byRoom[String(classroom.id)];
        if (!roomData || roomData.length === 0) continue;

        const rows: any[][] = [HEADER];
        for (const day of DAYS) {
          for (const slot of REAL_SLOTS) {
            const match = roomData.find(a => a.day_of_week === day && a.slot_id === slot.id);
            if (!match) {
              rows.push([day, null, slot.start, slot.end, null]);
            } else if (match.activity_type === 'meeting') {
              rows.push([day, "-", slot.start, slot.end, "-"]);
            } else {
              rows.push([
                day,
                match.subjects?.code || null,
                slot.start,
                slot.end,
                match.teachers?.teacher_code || match.teachers?.full_name || null,
              ]);
            }
          }
        }

        const sheetName = classroom.name.replace(/\//g, '-').replace(/[\\*?[\]:]/g, '').slice(0, 31);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];

        // style header row
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
          if (cell) {
            cell.s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "4F46E5" }, patternType: "solid" },
              alignment: { horizontal: "center" },
            };
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      if (wb.SheetNames.length === 0) { alert("ไม่มีห้องที่มีข้อมูลตารางสอน"); return; }

      XLSX.writeFile(wb, `ตารางสอน_ปี${termInfo.year}_เทอม${termInfo.semester}.xlsx`);
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setExporting(false);
    }
  }

  // ── Export เฉพาะห้องที่เลือก ──
  function handleExportCurrent() {
    if (!selectedRoom || assignments.length === 0) return;
    const classroom = classrooms.find(c => String(c.id) === String(selectedRoom));
    if (!classroom) return;

    const wb = XLSX.utils.book_new();
    const HEADER = ["วัน", "รหัสวิชา", "เริ่มเวลา", "หมดเวลา", "รหัสผู้ใช้งาน(ครูผู้สอน)"];
    const rows: any[][] = [HEADER];

    for (const day of DAYS) {
      for (const slot of REAL_SLOTS) {
        const match = assignments.find(a => a.day_of_week === day && a.slot_id === slot.id);
        if (!match) {
          rows.push([day, null, slot.start, slot.end, null]);
        } else if (match.activity_type === 'meeting') {
          rows.push([day, "-", slot.start, slot.end, "-"]);
        } else {
          rows.push([
            day,
            match.subjects?.code || null,
            slot.start,
            slot.end,
            match.teachers?.teacher_code || match.teachers?.full_name || null,
          ]);
        }
      }
    }

    const sheetName = classroom.name.replace(/\//g, '-').replace(/[\\*?[\]:]/g, '').slice(0, 31);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `ตารางสอน_${classroom.name}_ปี${termInfo.year}.xlsx`);
  }

  const grades = useMemo(() => {
    const set = new Set<string>();
    classrooms.forEach(c => { const m = c.name.trim().match(/^(\d+)\//); if (m) set.add(m[1]); });
    return [...set].sort();
  }, [classrooms]);

  const filteredRooms = useMemo(() => {
    if (gradeFilter === "all") return classrooms;
    return classrooms.filter(c => c.name.trim().startsWith(gradeFilter + "/"));
  }, [classrooms, gradeFilter]);

  const selectedRoomName = classrooms.find(c => String(c.id) === String(selectedRoom))?.name ?? "";
  const fs = FONT_SIZES[fontIdx];
  const totalPeriods = assignments.filter(a => !a.activity_type).length;

  function getCell(day: string, slotId: number) {
    return assignments.filter(a => a.day_of_week === day && a.slot_id === slotId);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-sans text-slate-800">
      <div className="max-w-full px-4 md:px-6 py-5">

        {/* ── Header ── */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">🏫 ตารางเรียนรายห้อง</h1>
            <p className="text-slate-400 text-sm mt-0.5">ปีการศึกษา {termInfo.year} · เทอม {termInfo.semester}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export ทุกห้อง */}
            <button onClick={handleExportAll} disabled={exporting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl shadow-sm text-sm font-semibold transition disabled:opacity-50">
              {exporting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> กำลัง export...</>
              ) : (
                <><span>⬇</span> Export ทุกห้อง</>
              )}
            </button>
            <Link href="/" className="bg-white border px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm text-sm font-semibold text-slate-600">
              ⬅ กลับหน้าหลัก
            </Link>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-5">
          <div className="flex flex-wrap gap-4 items-end">
            {/* filter ชั้น */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">ระดับชั้น</label>
              <div className="flex gap-1.5 flex-wrap">
                {["all", ...grades].map(g => (
                  <button key={g} onClick={() => { setGradeFilter(g); setSelectedRoom(""); }}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-bold border transition-all
                      ${gradeFilter === g ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
                    {g === "all" ? "ทั้งหมด" : `ม.${g}`}
                  </button>
                ))}
              </div>
            </div>

            {/* เลือกห้อง */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">ห้องเรียน</label>
              <select className="w-full p-2.5 border-2 border-slate-200 rounded-xl bg-white outline-none focus:border-indigo-400 text-sm font-semibold text-slate-700 transition"
                value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
                <option value="">-- กรุณาเลือกห้องเรียน --</option>
                {filteredRooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* ปี/เทอม */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">ปีการศึกษา</label>
              <input type="number" value={termInfo.year} onChange={e => setTermInfo(t => ({ ...t, year: e.target.value }))}
                className="w-24 p-2.5 border-2 border-slate-200 rounded-xl bg-white text-center font-bold text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">เทอม</label>
              <select value={termInfo.semester} onChange={e => setTermInfo(t => ({ ...t, semester: e.target.value }))}
                className="p-2.5 border-2 border-slate-200 rounded-xl bg-white font-bold text-sm outline-none focus:border-indigo-400">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">Summer</option>
              </select>
            </div>

            {/* ขนาดตัวอักษร */}
            <div className="ml-auto">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">ขนาดตัวอักษร</label>
              <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {FONT_SIZES.map((f, i) => (
                  <button key={i} onClick={() => setFontIdx(i)}
                    className={`px-3.5 py-1.5 font-bold transition-all ${fontIdx === i ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                    style={{ fontSize: `${0.72 + i * 0.08}rem` }}>{f.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── ตาราง ── */}
        {!selectedRoom ? (
          <div className="py-28 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-sm">
            <div className="text-5xl mb-4">🏫</div>
            <div className="text-slate-500 font-semibold text-lg">กรุณาเลือกห้องเรียน</div>
            <div className="text-slate-400 text-sm mt-1">หรือกด "Export ทุกห้อง" เพื่อดาวน์โหลด Excel ทั้งหมด</div>
          </div>
        ) : loading ? (
          <div className="py-28 text-center bg-white rounded-2xl border shadow-sm">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-slate-400 font-medium">กำลังโหลดข้อมูล...</div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
            {/* Banner */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-slate-50 flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-xl">🏫</div>
              <div>
                <div className="text-lg font-extrabold text-slate-800">ห้อง {selectedRoomName}</div>
                <div className="text-xs text-slate-400 mt-0.5">ปีการศึกษา {termInfo.year} · เทอม {termInfo.semester}</div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <div className="text-center bg-white rounded-xl px-3 py-1.5 border border-slate-100 shadow-sm">
                  <div className="text-lg font-bold text-indigo-600">{totalPeriods}</div>
                  <div className="text-[10px] text-slate-400">คาบ/สัปดาห์</div>
                </div>
                {/* Export เฉพาะห้องนี้ */}
                <button onClick={handleExportCurrent}
                  className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-sm font-semibold transition">
                  ⬇ Excel ห้องนี้
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="border-collapse w-full" style={{ minWidth: 720 }}>
                <colgroup>
                  <col style={{ width: 72 }} />
                  {ALL_SLOTS.map(s => <col key={s.id} style={{ width: s.isBreak ? 24 : undefined }} />)}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200 text-slate-400 font-semibold text-center" style={{ fontSize: 10 }}>วัน / คาบ</th>
                    {ALL_SLOTS.map(s => (
                      <th key={s.id} className={`border-r border-slate-200 last:border-0 text-center py-2 px-1 ${s.isBreak ? 'bg-slate-100/60' : ''}`}>
                        {s.isBreak ? <div className="text-slate-300" style={{ fontSize: 8 }}>พัก</div> : (
                          <>
                            <div className="font-bold text-slate-700" style={{ fontSize: 11 }}>{s.label}</div>
                            <div className="text-slate-400 mt-0.5 leading-tight" style={{ fontSize: 9 }}>{s.time}</div>
                          </>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, di) => {
                    const dc = DAY_CONFIG[day] || { header: "bg-slate-200 text-slate-700", cell: "bg-slate-50 border-slate-200", badge: "bg-slate-200 text-slate-600" };
                    return (
                      <tr key={day} className={`border-b border-slate-100 last:border-0 ${di % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                        <td className="border-r border-slate-200 p-1 text-center align-middle">
                          <div className={`rounded-xl py-2 px-1 font-bold text-xs leading-tight ${dc.header}`}>{day}</div>
                        </td>
                        {ALL_SLOTS.map(slot => {
                          if (slot.isBreak) return <td key={slot.id} className="bg-slate-100/40 border-r border-slate-100" style={{ width: 24 }} />;
                          const cells = getCell(day, Number(slot.id));
                          const grouped: { subjectId: string; subjectName: string; subjectCode: string; teachers: string[]; isMeeting: boolean; note: string }[] = [];
                          for (const a of cells) {
                            const key = a.activity_type === 'meeting' ? `__meet__${a.id}` : String(a.subject_id);
                            const ex = grouped.find(g => g.subjectId === key);
                            if (ex) { if (a.teachers?.full_name && !ex.teachers.includes(a.teachers.full_name)) ex.teachers.push(a.teachers.full_name); }
                            else grouped.push({ subjectId: key, subjectName: a.subjects?.name || "", subjectCode: a.subjects?.code || "", isMeeting: a.activity_type === 'meeting', note: a.note || "", teachers: a.teachers?.full_name ? [a.teachers.full_name] : [] });
                          }
                          return (
                            <td key={slot.id} className="border-r border-slate-100 last:border-0 p-1 align-middle" style={{ height: fs.cellH, verticalAlign: 'middle' }}>
                              {grouped.length === 0 ? (
                                <div className="h-full rounded-lg border border-dashed border-slate-100" />
                              ) : grouped.map((g, gi) => (
                                <div key={gi} className={`h-full flex flex-col justify-center px-2 py-1.5 rounded-xl border shadow-sm
                                  ${g.isMeeting ? 'bg-orange-50 border-orange-200' : dc.cell}`}>
                                  {g.isMeeting ? (
                                    <div className="font-bold text-orange-600 leading-snug" style={{ fontSize: fs.name }}>📅 {g.note || "ประชุม"}</div>
                                  ) : (
                                    <>
                                      <div className={`inline-flex self-start px-1.5 py-0.5 rounded-md font-mono font-bold mb-1 ${dc.badge}`} style={{ fontSize: fs.name - 2 }}>{g.subjectCode}</div>
                                      <div className="font-bold text-slate-800 leading-snug line-clamp-2" style={{ fontSize: fs.name }}>{g.subjectName}</div>
                                      <div className="mt-1 space-y-0.5">
                                        {g.teachers.map((name, ti) => (
                                          <div key={ti} className="flex items-center gap-1">
                                            <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center font-bold
                                              ${ti === 0 ? 'bg-indigo-200 text-indigo-700' : ti === 1 ? 'bg-violet-200 text-violet-700' : 'bg-pink-200 text-pink-700'}`}
                                              style={{ fontSize: 7 }}>{ti + 1}</span>
                                            <span className="text-slate-500 line-clamp-1" style={{ fontSize: fs.teacher }}>{name}</span>
                                          </div>
                                        ))}
                                        {g.teachers.length === 0 && <div className="text-slate-300" style={{ fontSize: fs.teacher }}>—</div>}
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="px-5 py-3 border-t bg-slate-50 flex flex-wrap gap-3 items-center">
              <span className="text-xs font-bold text-slate-400 uppercase">สัญลักษณ์:</span>
              {DAYS.map(day => {
                const dc = DAY_CONFIG[day];
                return (
                  <span key={day} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`w-3 h-3 rounded-sm ${dc.cell.split(' ')[0]} border ${dc.cell.split(' ')[1]}`} />
                    {day.slice(0, day === "พฤหัสบดี" ? 4 : 2)}
                  </span>
                );
              })}
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-3 h-3 rounded-sm bg-orange-50 border border-orange-200" />ประชุม/กิจกรรม
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}