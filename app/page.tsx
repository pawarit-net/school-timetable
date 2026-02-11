"use client";
import { useState, useEffect } from "react";
import { supabase } from '@/lib/supabase'
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
    const { count: cCount } = await supabase.from("course_structures").select("*", { count: 'exact', head: true }); 
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
      .limit(5);

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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
               <div className="bg-indigo-600 text-white p-2 rounded-lg text-xl">🏫</div>
               <div>
                  <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                    School Scheduler
                  </h1>
                  <p className="text-slate-500 text-xs mt-0.5">ระบบบริหารจัดการตารางเรียน</p>
               </div>
            </div>
            <div className="bg-slate-100 px-4 py-2 rounded-full text-slate-700 font-bold text-sm flex items-center gap-2 border border-slate-200">
               <span>📅 ปีการศึกษา {academicInfo.year}</span>
               <span className="w-1 h-4 bg-slate-300 mx-1 rounded-full"></span>
               <span>เทอม {academicInfo.semester}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* --- Section 1: Stats Cards (ตอนนี้คลิกได้แล้ว!) --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            title="ครูทั้งหมด" 
            value={stats.teachers} 
            unit="คน" 
            icon="👨‍🏫" 
            color="text-blue-600" 
            bg="bg-blue-50" 
            href="/manage-teachers" 
          />
          <StatCard 
            title="รายวิชา" 
            value={stats.subjects} 
            unit="วิชา" 
            icon="📚" 
            color="text-emerald-600" 
            bg="bg-emerald-50" 
            href="/manage-subjects"
          />
          <StatCard 
            title="โครงสร้างวิชา" 
            value={stats.courses} 
            unit="รายการ" 
            icon="🗓️" 
            color="text-indigo-600" 
            bg="bg-indigo-50" 
            href="/courses"
          />
          <StatCard 
            title="ตารางสอน" 
            value={stats.assignments} 
            unit="คาบ" 
            icon="⚡" 
            color="text-amber-600" 
            bg="bg-amber-50" 
            href="/manage-assignments"
          />
        </div>

        {/* --- Section 2: Main Navigation --- */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-indigo-500 pl-3">
            🚀 เมนูหลัก (Main Menu)
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
             {/* 1. จัดโครงสร้าง */}
             <Link href="/courses" className="group p-6 bg-white rounded-2xl border border-indigo-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all ring-4 ring-indigo-50/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">แนะนำ</div>
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🗓️</div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600">จัดโครงสร้างรายวิชา</h3>
                <p className="text-sm text-slate-500 mt-1">จับคู่ วิชา + ครู + ห้องเรียน</p>
             </Link>

             {/* 2. จัดตารางสอน */}
             <Link href="/manage-assignments" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🏫</div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">จัดตารางสอน (ห้อง)</h3>
                <p className="text-sm text-slate-500 mt-1">Drag & Drop ลงตารางรายห้อง</p>
             </Link>

             {/* 3. ตารางครู */}
             <Link href="/teacher-schedule" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">👤</div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600">ตารางสอนรายบุคคล</h3>
                <p className="text-sm text-slate-500 mt-1">ตรวจสอบตารางสอนครู</p>
             </Link>
          </div>

          {/* เมนูย่อย (Settings) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <Link href="/manage-teachers" className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-sm transition-all group">
                <span className="text-2xl mb-2 group-hover:scale-110 transition">👨‍🏫</span>
                <span className="text-sm font-bold text-slate-600 group-hover:text-blue-700">จัดการครู</span>
             </Link>

             <Link href="/manage-subjects" className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-sm transition-all group">
                <span className="text-2xl mb-2 group-hover:scale-110 transition">📚</span>
                <span className="text-sm font-bold text-slate-600 group-hover:text-emerald-700">จัดการวิชา</span>
             </Link>

             <Link href="/manage-classrooms" className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:border-amber-300 hover:bg-amber-50/30 hover:shadow-sm transition-all group">
                <span className="text-2xl mb-2 group-hover:scale-110 transition">🏢</span>
                <span className="text-sm font-bold text-slate-600 group-hover:text-amber-700">ห้องเรียน</span>
             </Link>

             <Link href="/data-setup" className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-100 hover:shadow-sm transition-all group">
                <span className="text-2xl mb-2 group-hover:scale-110 transition group-hover:rotate-45">⚙️</span>
                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-800">ตั้งค่าระบบ</span>
             </Link>
          </div>
        </div>

        {/* --- Section 3: Recent Activity Table --- */}
        <div>
           <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-l-4 border-slate-400 pl-3">
                📝 ความเคลื่อนไหวล่าสุด
              </h2>
           </div>
           
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <table className="w-full text-left">
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
                               <div className="font-bold text-slate-800">{item.subjects?.code}</div>
                               <div className="text-xs text-slate-500">{item.subjects?.name}</div>
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
                          <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-600 transition p-1 rounded hover:bg-red-50">
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

      </main>
    </div>
  );
}

// --- Sub Component: Stat Card (Updated to be Clickable) ---
function StatCard({ title, value, unit, icon, color, bg, href }: any) {
  return (
    <Link href={href || "#"} className="block group">
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group-hover:shadow-md group-hover:border-indigo-200 transition-all cursor-pointer">
         <div>
            <p className="text-xs text-slate-500 font-medium uppercase mb-1 group-hover:text-indigo-600 transition-colors">{title}</p>
            <div className="flex items-baseline gap-2">
               <span className="text-3xl font-bold text-slate-800">{value}</span>
               <span className="text-xs text-slate-400">{unit}</span>
            </div>
         </div>
         <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${bg} ${color} group-hover:scale-110 transition-transform`}>
            {icon}
         </div>
      </div>
    </Link>
  );
}