"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ViewScheduleClassroom() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [assignments, setAssignments] = useState<any[]>([]);

  const days = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];

  useEffect(() => {
    // ดึงรายชื่อห้องเรียน
    const fetchClassrooms = async () => {
      const { data } = await supabase.from("classrooms").select("*").order("name");
      if (data) setClassrooms(data);
    };
    fetchClassrooms();
  }, []);

  useEffect(() => {
    if (!selectedClassroom) {
      setAssignments([]);
      return;
    }
    fetchSchedule();
  }, [selectedClassroom]);

  async function fetchSchedule() {
    const { data } = await supabase
      .from("teaching_assignments")
      .select(`
        *,
        subjects (name, code),
        teachers (full_name)
      `)
      .eq("classroom_id", selectedClassroom) // กรองตามห้องเรียน
      .order("start_time");

    if (data) setAssignments(data);
  }

  function getAssignmentsByDay(day: string) {
    return assignments.filter((a) => a.day_of_week === day);
  }

  return (
    <div className="min-h-screen bg-white text-black p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            🏫 ตารางเรียน (ตามห้อง)
          </h1>
          <button onClick={() => router.push('/')} className="bg-gray-200 px-4 py-2 rounded-lg font-bold hover:bg-gray-300">
            ⬅️ กลับหน้าหลัก
          </button>
        </div>

        {/* เลือกห้องเรียน */}
        <div className="bg-green-50 p-6 rounded-xl border border-green-100 mb-8">
          <label className="block text-lg font-bold text-green-900 mb-2">เลือกห้องเรียน:</label>
          <select 
            className="w-full md:w-1/2 p-3 border-2 border-green-300 rounded-lg text-lg bg-white"
            value={selectedClassroom}
            onChange={(e) => setSelectedClassroom(e.target.value)}
          >
            <option value="">-- กรุณาเลือกห้องเรียน --</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* แสดงผล */}
        {selectedClassroom && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {days.map((day) => {
              const todaysClass = getAssignmentsByDay(day);
              if (todaysClass.length === 0) return null;

              return (
                <div key={day} className="border rounded-xl overflow-hidden shadow-sm bg-white">
                  <div className={`p-3 font-bold text-center text-white text-xl
                    ${day === 'จันทร์' ? 'bg-yellow-500' : 
                      day === 'อังคาร' ? 'bg-pink-500' :
                      day === 'พุธ' ? 'bg-green-600' :
                      day === 'พฤหัส' ? 'bg-orange-500' :
                      day === 'ศุกร์' ? 'bg-blue-600' : 'bg-purple-500'}
                  `}>
                    {day}
                  </div>
                  
                  <div className="p-4 divide-y">
                    {todaysClass.map((item) => (
                      <div key={item.id} className="py-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono text-gray-500 font-bold text-sm bg-gray-100 px-2 py-1 rounded">
                            {item.start_time.slice(0,5)} - {item.end_time.slice(0,5)}
                          </span>
                          {/* โชว์ชื่อครูแทนชื่อห้อง */}
                          <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                             ครู{item.teachers?.full_name}
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
      </div>
    </div>
  );
}