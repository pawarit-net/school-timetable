"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function Home() {
  // เพิ่ม state สำหรับเก็บข้อมูลปีการศึกษา
  const [academicInfo, setAcademicInfo] = useState({ year: "...", semester: "..." });
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, assignments: 0 });
  const [schedules, setSchedules] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchSchedules(); 
  }, []);

  async function fetchStats() {
    // 1. ดึงข้อมูลปีการศึกษาปัจจุบัน (จากที่เราเพิ่งทำไป)
    const { data: settings } = await supabase
      .from("academic_settings")
      .select("*")
      .eq('id', 1) // เอาแถวแรก (ที่เรากำหนดเป็นค่าหลัก)
      .single();

    if (settings) {
      setAcademicInfo({ 
        year: settings.year.toString(), 
        semester: settings.semester 
      });
    }

    // 2. ดึงจำนวนข้อมูลต่างๆ
    const { count: tCount } = await supabase.from("teachers").select("*", { count: 'exact', head: true });
    const { count: sCount } = await supabase.from("subjects").select("*", { count: 'exact', head: true });
    const { count: aCount } = await supabase.from("teaching_assignments").select("*", { count: 'exact', head: true });

    setStats({
      teachers: tCount || 0,
      subjects: sCount || 0,
      assignments: aCount || 0
    });
  }

  // --- ฟังก์ชันดึงข้อมูลตารางสอน ---
  async function fetchSchedules() {
    setLoading(true);
    const { data, error } = await supabase
      .from("teaching_assignments")
      .select(`
        id,
        day_of_week,
        slot_id,
        activity_type,
        note,
        subjects (code, name),
        teachers (full_name),
        classrooms (name)
      `)
      .order("created_at", { ascending: false }) 
      .limit(10); 

    if (!error) setSchedules(data || []);
    setLoading(false);
  }

  // --- ฟังก์ชันลบข้อมูล ---
  async function handleDelete(id: number) {
    if (confirm("คุณแน่ใจใช่ไหมที่จะลบรายการนี้?")) {
      const { error } = await supabase.from("teaching_assignments").delete().eq("id", id);
      if (error) {
        alert("ลบไม่สำเร็จ: " + error.message);
      } else {
        fetchSchedules(); 
        fetchStats();    
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-black">
      <div className="max-w-7xl mx-auto"> {/* ขยายความกว้างเล็กน้อยเพื่อให้ใส่ 4 การ์ดได้สวย */}
        
        {/* หัวข้อส่วนบน */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold text-blue-900 mb-4 tracking-tight">🏫 School Scheduler</h1>
          <p className="text-gray-500 text-lg">ระบบบริหารจัดการตารางเรียนและภาระงานสอน</p>
        </div>

        {/* --- ส่วนที่ 1: Dashboard Stats (ปรับเป็น 4 คอลัมน์) --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          
          {/* การ์ด 1: ปีการศึกษา (NEW) */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-3xl text-white shadow-lg transform hover:scale-105 transition relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-20 text-8xl -mr-4 -mt-4">📅</div>
            <div className="text-sm opacity-80 mb-1 font-bold">ปีการศึกษาปัจจุบัน</div>
            <div className="text-4xl font-bold">{academicInfo.year}</div>
            <div className="mt-1 inline-block bg-white/20 px-3 py-1 rounded-lg text-sm font-medium">
               ภาคเรียนที่ {academicInfo.semester}
            </div>
          </div>

          {/* การ์ด 2: ครู */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-3xl text-white shadow-lg transform hover:scale-105 transition">
            <div className="text-sm opacity-80 mb-1 font-bold">ครูทั้งหมด</div>
            <div className="text-4xl font-bold">{stats.teachers} <span className="text-xl font-normal opacity-80">ท่าน</span></div>
          </div>

          {/* การ์ด 3: วิชา */}
          <div className="bg-gradient-to-br from-pink-500 to-pink-600 p-6 rounded-3xl text-white shadow-lg transform hover:scale-105 transition">
            <div className="text-sm opacity-80 mb-1 font-bold">วิชาทั้งหมด</div>
            <div className="text-4xl font-bold">{stats.subjects} <span className="text-xl font-normal opacity-80">วิชา</span></div>
          </div>

          {/* การ์ด 4: ภาระงาน */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-3xl text-white shadow-lg transform hover:scale-105 transition">
            <div className="text-sm opacity-80 mb-1 font-bold">ภาระงานรวม</div>
            <div className="text-4xl font-bold">{stats.assignments} <span className="text-xl font-normal opacity-80">คาบ</span></div>
          </div>
        </div>

        {/* --- ส่วนที่ 2: เมนูหลัก --- */}
        <h2 className="text-2xl font-bold mb-6 text-gray-700 border-l-4 border-blue-600 pl-4 flex items-center gap-2">
            🚀 เมนูจัดการระบบ
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
             {/* เมนู 1: จัดตาราง (รายห้อง) */}
             <Link href="/manage-assignments" className="group relative overflow-hidden bg-white p-6 rounded-2xl shadow-md border-2 border-blue-100 hover:border-blue-400 transition-all">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-4 rounded-full text-3xl group-hover:scale-110 transition">🏫</div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-600">จัดตารางสอน (รายห้อง)</h3>
                        <p className="text-gray-500 text-sm mt-1">กำหนดรายวิชาลงในตารางเรียนของแต่ละห้องเรียน</p>
                    </div>
                </div>
             </Link>

             {/* เมนู 2: ตารางครู (รายบุคคล) */}
             <Link href="/teacher-schedule" className="group relative overflow-hidden bg-white p-6 rounded-2xl shadow-md border-2 border-orange-100 hover:border-orange-400 transition-all">
                <div className="flex items-center gap-4">
                    <div className="bg-orange-100 p-4 rounded-full text-3xl group-hover:scale-110 transition">👤</div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 group-hover:text-orange-600">ตารางสอนรายบุคคล</h3>
                        <p className="text-gray-500 text-sm mt-1">ดูตารางครูแต่ละท่าน และล็อกวันประชุม/กิจกรรม</p>
                    </div>
                </div>
             </Link>
        </div>

        {/* เมนูย่อยอื่นๆ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
           <MenuButtonSmall href="/manage-teachers" icon="👨‍🏫" title="จัดการครู" />
           <MenuButtonSmall href="/manage-classrooms" icon="🏢" title="จัดการห้องเรียน" />
           <MenuButtonSmall href="/manage-subjects" icon="📚" title="จัดการรายวิชา" />
           <MenuButtonSmall href="/data-setup" icon="⚙️" title="ตั้งค่าระบบ" />
        </div>

        {/* --- ส่วนที่ 3: ตารางแสดงข้อมูลล่าสุด --- */}
        <h2 className="text-2xl font-bold mb-6 text-gray-700 border-l-4 border-green-500 pl-4">
            📝 ความเคลื่อนไหวล่าสุด (10 รายการ)
        </h2>
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-bold text-gray-600">ประเภท/วิชา</th>
                <th className="p-4 font-bold text-gray-600">ผู้สอน</th>
                <th className="p-4 font-bold text-gray-600">วัน/เวลา</th>
                <th className="p-4 font-bold text-gray-600">ห้อง</th>
                <th className="p-4 font-bold text-gray-600 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">กำลังโหลดข้อมูล...</td></tr>
              ) : schedules.length > 0 ? (
                schedules.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="p-4">
                        {item.activity_type === 'meeting' ? (
                            <div className="flex items-center gap-2">
                                <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded-full font-bold">กิจกรรม</span>
                                <span className="font-medium text-gray-800">{item.note || "ประชุม"}</span>
                            </div>
                        ) : (
                            <div>
                                <div className="font-bold text-blue-900">{item.subjects?.code}</div>
                                <div className="text-sm text-gray-500">{item.subjects?.name}</div>
                            </div>
                        )}
                    </td>
                    <td className="p-4 text-gray-600 font-medium">
                        {item.teachers?.full_name || "-"}
                    </td>
                    <td className="p-4 text-sm">
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md mr-2 font-bold">{item.day_of_week}</span>
                      คาบที่ {item.slot_id}
                    </td>
                    <td className="p-4">
                        {item.classrooms?.name ? `ห้อง ${item.classrooms.name}` : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="bg-white border border-red-200 text-red-500 p-2 rounded-lg hover:bg-red-50 transition shadow-sm"
                        title="ลบรายการนี้"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="p-12 text-center text-gray-400 italic">ยังไม่มีข้อมูลการสอนในระบบ</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

// Component ปุ่มเมนูอันเล็ก
function MenuButtonSmall({ href, icon, title }: { href: string, icon: string, title: string }) {
  return (
    <Link href={href}>
      <button className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all flex items-center justify-center gap-3">
        <span className="text-xl">{icon}</span>
        <span className="font-bold text-gray-600 text-sm">{title}</span>
      </button>
    </Link>
  );
}