"use client";
import { useState, useEffect } from "react";
import { supabase } from '@/lib/supabaseClient';

// --- Interfaces ---
interface Classroom { id: string; name: string; level?: string; }
interface ScheduleItem {
  id?: number; 
  classroom_id?: string; 
  day_of_week: string; 
  slot_id: number; 
  subject_id: string; 
  subjects?: { code: string; name: string };
  teachers?: { full_name: string };
}

export default function PrintTimetablePage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [termInfo, setTermInfo] = useState({ year: "2569", semester: "2" });
  const [selectedLevel, setSelectedLevel] = useState("all");

  const days = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
  const timeSlots = [
    { id: 1, time: "08:30-09:20" },
    { id: 2, time: "09:20-10:10" },
    { id: 3, time: "10:25-11:15" },
    { id: 4, time: "11:15-12:05" },
    { id: 5, time: "13:00-13:50" },
    { id: 6, time: "14:00-14:50" },
    { id: 7, time: "14:50-15:40" },
  ];

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: settings } = await supabase.from("academic_settings").select("*").single();
    const currentYear = settings?.year || "2569";
    const currentTerm = settings?.semester || "2";
    setTermInfo({ year: currentYear, semester: currentTerm });
    const { data: rooms } = await supabase.from("classrooms").select("*").order('name');
    const { data: schedules } = await supabase.from("teaching_assignments")
      .select(`*, subjects(code, name), teachers(full_name)`)
      .eq("academic_year", currentYear)
      .eq("semester", currentTerm);
    if (rooms) setClassrooms(rooms);
    if (schedules) setScheduleData(schedules);
    setLoading(false);
  }

  const getSlotData = (roomId: string, day: string, slotId: number) => {
    return scheduleData.find(s => 
      s.classroom_id === roomId && s.day_of_week === day && s.slot_id === slotId
    );
  };

  const filteredClassrooms = classrooms.filter(room => {
    if (selectedLevel === "all") return true;
    return room.name.startsWith(selectedLevel) || room.name.startsWith("ม." + selectedLevel);
  });

  if (loading) return <div className="p-10 text-center text-black font-bold">⏳ กำลังเตรียมข้อมูลสำหรับพิมพ์...</div>;

  const roomPages = filteredClassrooms;

  return (
    <div className="bg-gray-200 min-h-screen font-sans text-black">

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* ซ่อน navbar และ header ของเว็บไซต์ */
          nav, header, footer, aside,
          [class*="navbar"], [class*="header"], [class*="nav-"],
          .no-print { display: none !important; }
          .print-page {
            width: 297mm;
            height: 210mm;
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
            margin: 0 !important;
            overflow: hidden;
          }
          .print-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print bg-white border-b sticky top-0 z-50 px-6 py-3 flex flex-col md:flex-row justify-between items-center gap-4 shadow-md">
        <div className="flex items-center gap-4">
          <span className="font-bold text-black text-lg">🖨️ ระบบพิมพ์ตารางสอน</span>
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-lg border border-gray-300">
            <span className="text-sm text-black font-semibold">เลือกชั้น:</span>
            <select
              className="bg-white text-black text-sm font-bold focus:outline-none cursor-pointer py-1 px-2 rounded border border-gray-400"
              value={selectedLevel}
              onChange={e => setSelectedLevel(e.target.value)}
            >
              <option value="all">พิมพ์ทั้งหมด</option>
              <option value="4">มัธยมศึกษาปีที่ 4</option>
              <option value="5">มัธยมศึกษาปีที่ 5</option>
              <option value="6">มัธยมศึกษาปีที่ 6</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-blue-700 hover:bg-blue-800 text-white px-8 py-2 rounded-lg font-extrabold transition flex items-center gap-2 shadow-lg"
        >
          🖨️ สั่งพิมพ์ตารางสอน
        </button>
      </div>

      {/* คำแนะนำ */}
      <div className="no-print bg-amber-50 border border-amber-200 text-amber-800 text-sm px-6 py-2 flex items-center gap-2">
        <span>💡</span>
        <span>ก่อนพิมพ์: ในหน้าต่างพิมพ์ของ browser ให้เปิด <strong>"การตั้งค่าเพิ่มเติม"</strong> แล้ว <strong>ปิด "ส่วนหัวและส่วนท้าย"</strong> เพื่อซ่อน URL และชื่อเว็บไซต์</span>
      </div>

      {/* Pages */}
      {roomPages.length > 0 ? (
        roomPages.map((room: Classroom, pageIndex: number) => (
          <div
            key={pageIndex}
            className="print-page bg-white mx-auto my-8 shadow-2xl flex flex-col"
            style={{ width: '297mm', height: '210mm', overflow: 'hidden', boxSizing: 'border-box', padding: '7mm 9mm 6mm 9mm', fontFamily: 'Sarabun, sans-serif' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              {/* ซ้าย: โลโก้ + ชื่อโรงเรียน */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src="/logo.jpg" alt="logo"
                  style={{ width: '50px', height: '50px', objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '16px', lineHeight: 1.3, color: '#1e3a5f' }}>โรงเรียนดาราวิทยาลัย</div>
                  <div style={{ fontSize: '12px', color: '#555', fontWeight: 600 }}>ตารางเรียน ภาคเรียนที่ {termInfo.semester} ปีการศึกษา {termInfo.year}</div>
                </div>
              </div>
              {/* ขวา: ชื่อห้อง */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>ห้องเรียน</div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e3a5f', lineHeight: 1.1 }}>ม.{room.name}</div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '3px', background: 'linear-gradient(to right, #1e3a5f, #3b82f6, #1e3a5f)', borderRadius: '2px', marginBottom: '6px' }} />

            {/* Table */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', height: '100%', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
                    <th style={{ border: '1px solid #cbd5e1', width: '60px', fontWeight: 800, fontSize: '11px', padding: '5px 2px' }}>วัน / เวลา</th>
                    {timeSlots.map(t => (
                      <th key={t.id} style={{ border: '1px solid #cbd5e1', fontWeight: 800, padding: '4px 2px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>คาบ {t.id}</div>
                        <div style={{ fontSize: '9px', opacity: 0.85, marginTop: '1px' }}>{t.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day, di) => (
                    <tr key={day} style={{ backgroundColor: di % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                      <td style={{
                        border: '1px solid #cbd5e1',
                        fontWeight: 800, fontSize: '12px', textAlign: 'center',
                        backgroundColor: '#dbeafe', color: '#1e3a5f',
                        letterSpacing: '0.02em'
                      }}>{day}</td>
                      {timeSlots.map(slot => {
                        const data = getSlotData(room.id, day, slot.id);
                        return (
                          <td key={slot.id} style={{ border: '1px solid #cbd5e1', padding: '4px 5px', verticalAlign: 'middle', textAlign: 'center' }}>
                            {data ? (
                              <div>
                                <div style={{
                                  fontWeight: 800, fontSize: '11px', lineHeight: 1.3, color: '#1e293b',
                                  overflow: 'hidden', display: '-webkit-box',
                                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                                }}>
                                  {data.subjects?.name}
                                </div>
                                <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '2px' }}>
                                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#3b82f6', backgroundColor: '#eff6ff', padding: '0 3px', borderRadius: '3px' }}>
                                    {data.subjects?.code}
                                  </span>
                                  {data.teachers && (
                                    <span style={{ fontSize: '9px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60px' }}>
                                      {data.teachers.full_name?.split(' ')[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '14px' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Signature */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #e2e8f0' }}>
              {['นายทะเบียน / วิชาการ', 'ผู้อำนวยการโรงเรียน'].map(title => (
                <div key={title} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '14px' }}>ลงชื่อ .....................................................</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>( {title} )</div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center justify-center h-[50vh] text-black gap-4">
          <div className="text-6xl">📄</div>
          <div className="text-xl font-black">ไม่พบข้อมูลห้องเรียน ม.{selectedLevel}</div>
          <button onClick={() => setSelectedLevel('all')} className="bg-black text-white px-4 py-2 rounded-md font-bold">ดูทั้งหมด</button>
        </div>
      )}
    </div>
  );
}