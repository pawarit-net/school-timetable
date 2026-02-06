"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ViewSchedule() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [assignments, setAssignments] = useState<any[]>([]);

  // วันในสัปดาห์ (เอาไว้ลูปแสดงผล)
  const days = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];

  useEffect(() => {
    // ดึงรายชื่อครูมาใส่ Dropdown
    const fetchTeachers = async () => {
      const { data } = await supabase.from("teachers").select("*").order("full_name");
      if (data) setTeachers(data);
    };
    fetchTeachers();
  }, []);

  // เมื่อเลือกครู ให้ไปดึงตารางสอนของคนนั้นมา
  useEffect(() => {
    if (!selectedTeacher) {
      setAssignments([]);
      return;
    }
    fetchSchedule();
  }, [selectedTeacher]);

  async function fetchSchedule() {
    const { data } = await supabase
      .from("teaching_assignments")
      .select(`
        *,
        subjects (name, code),
        classrooms (name)
      `)
      .eq("teacher_id", selectedTeacher) // กรองเฉพาะครูที่เลือก
      .order("start_time"); // เรียงตามเวลา

    if (data) setAssignments(data);
  }

  // ฟังก์ชันกรองวิชาตามวัน
  function getAssignmentsByDay(day: string) {
    return assignments.filter((a) => a.day_of_week === day);
  }

  return (
    <div className="min-h-screen bg-white text-black p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            🔍 ตรวจสอบตารางสอน
          </h1>
          <button onClick={() => router.push('/')} className="bg-gray-200 px-4 py-2 rounded-lg font-bold hover:bg-gray-300">
            ⬅️ กลับหน้าหลัก
          </button>
        </div>

        {/* ช่องค้นหา */}
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8">
          <label className="block text-lg font-bold text-blue-900 mb-2">เลือกครูผู้สอนที่ต้องการดูตาราง:</label>
          <select 
            className="w-full md:w-1/2 p-3 border-2 border-blue-300 rounded-lg text-lg bg-white"
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
          >
            <option value="">-- กรุณาเลือกรายชื่อครู --</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>

        {/* พื้นที่แสดงตาราง */}
        {selectedTeacher && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {days.map((day) => {
              const todaysClass = getAssignmentsByDay(day);
              // ถ้าวันนั้นไม่มีสอน ไม่ต้องโชว์การ์ด (หรือจะโชว์ว่าว่างก็ได้)
              if (todaysClass.length === 0) return null; 

              return (
                <div key={day} className="border rounded-xl overflow-hidden shadow-sm bg-white">
                  {/* หัวการ์ด (วัน) */}
                  <div className={`p-3 font-bold text-center text-white text-xl
                    ${day === 'จันทร์' ? 'bg-yellow-500' : 
                      day === 'อังคาร' ? 'bg-pink-500' :
                      day === 'พุธ' ? 'bg-green-600' :
                      day === 'พฤหัส' ? 'bg-orange-500' :
                      day === 'ศุกร์' ? 'bg-blue-600' : 'bg-purple-500'}
                  `}>
                    {day}
                  </div>
                  
                  {/* รายการวิชาในวันนั้น */}
                  <div className="p-4 divide-y">
                    {todaysClass.map((item) => (
                      <div key={item.id} className="py-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono text-gray-500 font-bold text-sm bg-gray-100 px-2 py-1 rounded">
                            {item.start_time.slice(0,5)} - {item.end_time.slice(0,5)}
                          </span>
                          <span className="text-xs font-bold text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">
                            ห้อง {item.classrooms?.name}
                          </span>
                        </div>
                        <div className="font-bold text-lg">{item.subjects?.name}</div>
                        <div className="text-gray-400 text-sm">{item.subjects?.code}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedTeacher && assignments.length === 0 && (
          <div className="text-center p-10 text-gray-400 border-2 border-dashed rounded-xl">
            ยังไม่มีตารางสอนสำหรับครูท่านนี้
          </div>
        )}
      </div>
    </div>
  );
}
