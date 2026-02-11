"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function Home() {
  // State เก็บข้อมูล
  const [academicInfo, setAcademicInfo] = useState({ year: "2567", semester: "1" });
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, assignments: 0, courses: 0 });
  const [schedules, setSchedules] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchSchedules(); 
  }, []);

  async function fetchStats() {
    // 1. ดึงปีการศึกษา
    const { data: settings } = await supabase
      .from("academic_settings")
      .select("*")
      .limit(1)
      .single();

    if (settings) {
      setAcademicInfo({ 
        year: settings.year?.toString() || "2567", 
        semester: settings.semester || "1" 
      });
    }

    // 2. ดึงจำนวนข้อมูล (Count)
    const { count: tCount } = await supabase.from("teachers").select("*", { count: 'exact', head: true });
    const { count: sCount } = await supabase.from("subjects").select("*", { count: 'exact', head: true });
    // เพิ่มการนับ Course Structure
    const { count: cCount } = await supabase.from("course_structures").select("*", { count: 'exact', head: true }); 
    // นับ Assignments เดิม
    const { count: aCount } = await supabase.from("teaching_assignments").select("*", { count: 'exact', head: true });

    setStats({
      teachers: tCount || 0,
      subjects: sCount || 0,
      courses: cCount || 0,
      assignments: aCount || 0
    });
  }

  // --- ดึงข้อมูลกิจกรรมล่าสุด ---
  async function fetchSchedules() {
    setLoading(true);
    const { data, error } = await supabase
      .from("teaching_assignments")
      .select(`
        id, day_of_week, slot_id, activity_type, note,
        subjects (code, name),
        teachers (full_name),
        classrooms (name)
      `)
      .order("created_at", { ascending: false }) 
      .limit(5); // เอาแค่ 5 รายการล่าสุดพอ

    if (!error) setSchedules(data || []);
    setLoading(false);
  }

  // --- ฟังก์ชันลบ ---
  async function handleDelete(id: number) {
    if (!confirm("ยืนยันการลบรายการนี้?")) return;
    const { error } = await supabase.from("teaching_assignments").delete().eq("id", id);
    if (error) alert("ลบไม่สำเร็จ: " + error.message);
    else { fetchSchedules(); fetchStats(); }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      
      {/* Header Section */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
               <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                 🏫 <span className="hidden md:inline">School Scheduler</span>
                 <span className="md:hidden">Scheduler</span>
               </h1>
            </div>
            <div className="bg-indigo-50 px-4 py-2 rounded-xl text-indigo-700 font-medium text-sm flex items-center gap-2 border border-indigo-100">
               <span>📅 ปีการศึกษา {academicInfo.year}</span>
               <span className="w-1 h-4 bg-indigo-200 mx-1"></span>
               <span>เทอม {academicInfo.semester}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* --- Section 1: Stats Cards --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="ครูทั้งหมด" value={stats.teachers} unit="คน" icon="👨‍🏫" color="text-blue-600" bg="bg-blue-50" />
          <StatCard title="รายวิชา" value={stats.subjects} unit="วิชา" icon="📚" color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard title="โครงสร้างวิชา" value={stats.courses} unit="รายการ" icon="🗓️" color="text-indigo-600" bg="bg-indigo-50" />
          <StatCard title="ตารางสอน" value={stats.assignments} unit="คาบ" icon="⚡" color="text-amber-600" bg="bg-amber-50" />
        </div>

        {/* --- Section 2: Main Menu --- */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            🚀 เมนูจัดการ
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             
             {/* 1. จัดโครงสร้างรายวิชา (New) */}
             <Link href="/courses" className="group p-6 bg-white rounded-2xl border border-indigo-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all ring-4 ring-indigo-50/50">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                  🗓️
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600">จัดโครงสร้างรายวิชา</h3>
                <p className="text-sm text-slate-500 mt-1">จับคู่ วิชา + ครู + ห้องเรียน</p>
             </Link>

             {/* 2. จัดตารางสอน (Old) */}
             <Link href="/manage-assignments" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                  🏫
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">จัดตารางสอน (Drag & Drop)</h3>
                <p className="text-sm text-slate-500 mt-1">ลงคาบเรียนรายห้อง</p>
             </Link>

             {/* 3. ตารางสอนครู */}
             <Link href="/teacher-schedule" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">
                  👤
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600">ตารางสอนรายบุคคล</h3>
                <p className="text-sm text-slate-500 mt-1">ตรวจสอบตารางสอนของครู</p>
             </Link>
          </div>

          {/* เมนูย่อย (Settings) - แก้ Link ตรงนี้ให้ตรงกับชื่อ Folder */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
             <MiniMenu href="/manage-teachers" icon="👨‍🏫" label="ข้อมูลครู" />
             <MiniMenu href="/manage-subjects" icon="📚" label="ข้อมูลวิชา" />
             <MiniMenu href="/manage-classrooms" icon="🏢" label="ห้องเรียน" />
             <MiniMenu href="/settings" icon="⚙️" label="ตั้งค่าระบบ" />
          </div>
        </div>

        {/* --- Section 3: Recent Activity Table --- */}
        <div>
           <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                📝 ความเคลื่อนไหวล่าสุด
              </h2>
              <span className="text-xs text-slate-400">5 รายการล่าสุด</span>
           </div>
           
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-left min-w-[600px]">
                 <thead className="bg-slate-50 border-b border-slate-100">
                   <tr>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">วิชา / กิจกรรม</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">ผู้สอน</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">เวลาเรียน</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">ห้องเรียน</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">จัดการ</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {loading ? (
                     <tr><td colSpan={5} className="py-10 text-center text-slate-400">⏳ กำลังโหลดข้อมูล...</td></tr>
                   ) : schedules.length > 0 ? (
                     schedules.map((item) => (
                       <tr key={item.id} className="hover:bg-slate-50/80 transition">
                         <td className="px-6 py-4">
                            {item.activity_type === 'meeting' ? (
                               <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-orange-50 text-orange-700 text-xs font-bold">
                                 🚩 {item.note || "กิจกรรม"}
                               </span>
                            ) : (
                               <div>
                                 <div className="font-bold text-slate-800">{item.subjects?.code || "ไม่ระบุ"}</div>
                                 <div className="text-xs text-slate-500 truncate max-w-[150px]">{item.subjects?.name}</div>
                               </div>
                            )}
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                            {item.teachers?.full_name || "-"}
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                            <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs mr-2">{item.day_of_week}</span>
                            คาบที่ {item.slot_id}
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                            {item.classrooms?.name || "-"}
                         </td>
                         <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-600 transition p-2 rounded-lg hover:bg-red-50">
                              🗑️
                            </button>
                         </td>
                       </tr>
                     ))
                   ) : (
                     <tr><td colSpan={5} className="py-10 text-center text-slate-400">ยังไม่มีข้อมูลล่าสุด</td></tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>
        </div>

      </main>
    </div>
  );
}

// --- Sub Components ---

function StatCard({ title, value, unit, icon, color, bg }: any) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
       <div>
          <p className="text-xs text-slate-500 font-medium uppercase mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
             <span className={`text-2xl md:text-3xl font-bold ${color}`}>{value}</span>
             <span className="text-xs text-slate-400">{unit}</span>
          </div>
       </div>
       <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${bg} ${color}`}>
          {icon}
       </div>
    </div>
  );
}

function MiniMenu({ href, icon, label }: any) {
  return (
    <Link href={href} className="flex flex-col md:flex-row items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm hover:bg-indigo-50/30 transition-all">
       <span className="text-xl">{icon}</span>
       <span className="text-sm font-medium text-slate-600">{label}</span>
    </Link>
  );
}