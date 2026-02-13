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

  useEffect(() => {
    fetchData();
  }, []);

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
      s.classroom_id === roomId && 
      s.day_of_week === day && 
      s.slot_id === slotId
    );
  };

  const filteredClassrooms = classrooms.filter(room => {
    if (selectedLevel === "all") return true;
    return room.name.startsWith(selectedLevel) || room.name.startsWith("ม." + selectedLevel);
  });

  const chunkArray = (arr: any[], size: number) => {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
      arr.slice(i * size, i * size + size)
    );
  };

  if (loading) return <div className="p-10 text-center text-black font-bold">⏳ กำลังเตรียมข้อมูลสำหรับพิมพ์...</div>;

  const roomPairs = chunkArray(filteredClassrooms, 2);

  return (
    // ลบ class print: ออกจากตรงนี้ เพื่อลดโอกาสหน้าขาว
    <div className="bg-gray-100 min-h-screen font-sans text-black">
      
      {/* แถบเครื่องมือ */}
      <div className="bg-white border-b sticky top-0 z-50 px-6 py-3 flex flex-col md:flex-row justify-between items-center gap-4 print:hidden shadow-md">
         <div className="flex items-center gap-4">
            <span className="font-bold text-black text-lg">🖨️ ระบบพิมพ์ตารางสอน</span>
            
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-lg border border-gray-300">
                <span className="text-sm text-black font-semibold">เลือกชั้น:</span>
                <select 
                    className="bg-white text-black text-sm font-bold focus:outline-none cursor-pointer py-1 px-2 rounded border border-gray-400"
                    style={{ color: 'black', backgroundColor: 'white' }} 
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
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
            <span>🖨️</span> สั่งพิมพ์ตารางสอน
         </button>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: landscape; margin: 0; }
          body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
            background-color: white !important;
          }
          /* บังคับให้ Div ตารางแสดงผลแน่นอน */
          .print-container {
            display: block !important;
            visibility: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .bg-gray-100 { background-color: white !important; }
        }
      `}</style>

      {roomPairs.length > 0 ? (
        roomPairs.map((pair, pageIndex) => (
            // เพิ่ม class 'print-container' เพื่อใช้ควบคุมใน CSS ด้านบน
            <div key={pageIndex} className="print-container w-[297mm] h-[210mm] bg-white mx-auto my-8 shadow-lg overflow-hidden flex flex-col relative print:shadow-none print:m-0 print:break-after-page">
                
                {/* เส้นประแบ่งครึ่ง */}
                <div className="absolute top-[50%] left-0 w-full border-b border-dashed border-black z-10 print:block hidden transform -translate-y-1/2 opacity-30"></div>

                {pair.map((room: Classroom, index: number) => (
                    <div key={room.id} className={`h-[50%] w-full px-8 py-4 flex flex-col justify-between ${index === 0 ? 'border-b border-gray-200' : ''}`}>
                        
                        <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
                                    <img 
                                        src="/logo.jpg" 
                                        alt="School Logo" 
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.parentElement!.innerHTML = '<div class="font-bold text-xs border-2 border-black p-1">LOGO</div>';
                                        }}
                                    />
                                </div>
                                <div>
                                    <h1 className="text-xl font-extrabold text-black leading-tight">โรงเรียนดาราวิทยาลัย</h1>
                                    <p className="text-sm text-black font-bold">ภาคเรียนที่ {termInfo.semester} ปีการศึกษา {termInfo.year}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-black text-black">ม.{room.name}</div>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center">
                            <table className="w-full border-collapse border-2 border-black text-center text-xs h-full table-fixed">
                                <thead>
                                    <tr className="bg-gray-300 text-black h-8 border-b-2 border-black">
                                        <th className="border-r-2 border-black w-20 font-black text-black text-sm">วัน / เวลา</th>
                                        {timeSlots.map(t => (
                                            <th key={t.id} className="border-r-2 border-black px-1 text-black">
                                                <div className="font-black text-sm">{t.id}</div>
                                                <div className="text-[10px] font-bold text-black">{t.time}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {days.map(day => (
                                        <tr key={day} className="h-auto border-b border-black">
                                            <td className="border-r-2 border-black font-black text-black bg-gray-200 py-1 text-sm">{day}</td>
                                            {timeSlots.map(slot => {
                                                const data = getSlotData(room.id, day, slot.id);
                                                return (
                                                    <td key={slot.id} className="border-r-2 border-black p-1 align-middle h-[40px]"> 
                                                        {data ? (
                                                            <div className="flex flex-col justify-center h-full overflow-hidden">
                                                                <div className="font-black text-black text-[11px] leading-tight truncate px-1">{data.subjects?.name}</div>
                                                                <div className="flex justify-between px-1 mt-1 items-end">
                                                                    <span className="text-[10px] text-black font-extrabold">{data.subjects?.code}</span>
                                                                    {data.teachers && <span className="text-[9px] text-black truncate max-w-[70px] font-bold">{data.teachers.full_name?.split(' ')[0]}</span>}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 font-bold">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between mt-2 pt-2 px-16 text-xs">
                            <div className="text-center">
                                <p className="border-b-2 border-dotted border-black w-40 mx-auto mb-1"></p>
                                <p className="font-black text-black">( นายทะเบียน / วิชาการ )</p>
                            </div>
                            <div className="text-center">
                                <p className="border-b-2 border-dotted border-black w-40 mx-auto mb-1"></p>
                                <p className="font-black text-black">( ผู้อำนวยการโรงเรียน )</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        ))
      ) : (
        <div className="flex flex-col items-center justify-center h-[50vh] text-black gap-4">
            <div className="text-6xl">📄</div>
            <div className="text-xl font-black uppercase">ไม่พบข้อมูลห้องเรียน ม.{selectedLevel}</div>
            <button onClick={() => setSelectedLevel('all')} className="bg-black text-white px-4 py-2 rounded-md font-bold">
                ดูทั้งหมด
            </button>
        </div>
      )}
    </div>
  );
}