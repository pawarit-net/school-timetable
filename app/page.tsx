"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [academicInfo, setAcademicInfo] = useState({ year: "2567", semester: "1" });
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, assignments: 0, courses: 0 });
  const [schedules, setSchedules] = useState<any[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { router.push("/login"); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function checkSession() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // ดึง role จาก teachers table
    const { data: teacher } = await supabase
      .from("teachers").select("full_name, role").eq("email", user.email).maybeSingle();

    setRole(teacher?.role ?? "teacher");
    setFullName(teacher?.full_name ?? user.email ?? "");
    setAuthLoading(false);
    fetchStats();
    fetchSchedules();
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  async function fetchStats() {
    const { data: settings } = await supabase.from("academic_settings").select("*").limit(1).single();
    if (settings) setAcademicInfo({ year: settings.year?.toString() || "2567", semester: settings.semester || "1" });
    const [t, s, c, a] = await Promise.all([
      supabase.from("teachers").select("*", { count: 'exact', head: true }),
      supabase.from("subjects").select("*", { count: 'exact', head: true }),
      supabase.from("course_structures").select("*", { count: 'exact', head: true }),
      supabase.from("teaching_assignments").select("*", { count: 'exact', head: true }),
    ]);
    setStats({ teachers: t.count || 0, subjects: s.count || 0, courses: c.count || 0, assignments: a.count || 0 });
  }

  async function fetchSchedules() {
    setDashboardLoading(true);
    const { data } = await supabase
      .from("teaching_assignments")
      .select(`id, day_of_week, slot_id, activity_type, note, subjects(code, name), teachers(full_name), classrooms(name)`)
      .order("created_at", { ascending: false }).limit(5);
    setSchedules(data || []);
    setDashboardLoading(false);
  }

  async function handleDelete(id: number) {
    await supabase.from("teaching_assignments").delete().eq("id", id);
    fetchSchedules(); fetchStats();
  }

  const isAdmin = role === "admin";

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">กำลังตรวจสอบข้อมูล...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              🏫 <span className="hidden md:inline">School Scheduler</span>
              <span className="md:hidden">Scheduler</span>
            </h1>
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 px-4 py-2 rounded-xl text-indigo-700 font-medium text-sm flex items-center gap-2 border border-indigo-100">
                <span>👤 {fullName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isAdmin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  {isAdmin ? '👑 Admin' : '🎓 Teacher'}
                </span>
                <span className="w-1 h-4 bg-indigo-200 mx-1" />
                <span>📅 ปี {academicInfo.year} เทอม {academicInfo.semester}</span>
              </div>
              <button onClick={handleLogout} className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 transition">
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="ครูทั้งหมด"     value={stats.teachers}    unit="คน"      icon="👨‍🏫" color="text-blue-600"    bg="bg-blue-50" />
          <StatCard title="รายวิชา"         value={stats.subjects}    unit="วิชา"    icon="📚"  color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard title="โครงสร้างวิชา"  value={stats.courses}     unit="รายการ"  icon="🗓️" color="text-indigo-600"  bg="bg-indigo-50" />
          <StatCard title="ตารางสอน"        value={stats.assignments} unit="คาบ"     icon="⚡"  color="text-amber-600"   bg="bg-amber-50" />
        </div>

        {/* เมนูหลัก */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">🚀 เมนูหลัก</h2>

          {/* ─── ทุกคนเห็น ─── */}
          <div className={`grid grid-cols-1 gap-6 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <Link href="/teacher-schedule" className="group p-6 bg-white rounded-2xl border border-orange-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all ring-4 ring-orange-50/50">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">👤</div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600">ตารางสอนรายบุคคล</h3>
              <p className="text-sm text-slate-500 mt-1">ตรวจสอบตารางสอนของครู</p>
            </Link>

            <Link href="/view-schedule-classroom" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🏫</div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-sky-600">ดูตารางสอนรายห้อง</h3>
              <p className="text-sm text-slate-500 mt-1">ดูตารางเรียนของแต่ละห้อง</p>
            </Link>

            {/* admin เท่านั้น */}
            {isAdmin && (
              <Link href="/manage-assignments" className="group p-6 bg-white rounded-2xl border border-blue-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all ring-4 ring-blue-50/50">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">📅</div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">จัดตารางสอน</h3>
                <p className="text-sm text-slate-500 mt-1">ลงคาบเรียนรายห้อง + Auto-assign</p>
              </Link>
            )}
          </div>

          {/* swap periods — ทุกคนเห็น */}
          <div className="mt-4">
            <Link href="/swap-periods" className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-violet-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all ring-4 ring-violet-50/50">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition">🔄</div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-violet-600">ระบบแลกคาบสอน</h3>
                <p className="text-sm text-slate-500 mt-0.5">ค้นหาคาบที่แลกได้โดยไม่ชนตารางสอนของทั้งสองฝ่าย</p>
              </div>
              <span className="ml-auto text-violet-300 group-hover:text-violet-500 text-xl">→</span>
            </Link>
          </div>

          {/* เมนู admin-only */}
          {isAdmin && (
            <div className="mt-6">
              <h2 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                👑 Admin
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/courses" className="group p-5 bg-white rounded-2xl border border-indigo-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition">🗓️</div>
                    <div>
                      <h3 className="font-bold text-slate-900 group-hover:text-indigo-600">โครงสร้างรายวิชา</h3>
                      <p className="text-xs text-slate-500 mt-0.5">จับคู่ วิชา + ครู + ห้องเรียน</p>
                    </div>
                  </div>
                </Link>
                <Link href="/print/timetable" target="_blank" className="group p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition">🖨️</div>
                    <div>
                      <h3 className="font-bold text-slate-900 group-hover:text-slate-600">พิมพ์ตารางสอน</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Export PDF</p>
                    </div>
                  </div>
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <MiniMenu href="/manage-teachers"    icon="👨‍🏫" label="ข้อมูลครู" />
                <MiniMenu href="/manage-subjects"    icon="📚"  label="ข้อมูลวิชา" />
                <MiniMenu href="/manage-classrooms"  icon="🏢"  label="ห้องเรียน" />
                <MiniMenu href="/settings"           icon="⚙️"  label="ตั้งค่าระบบ" />
              </div>
            </div>
          )}
        </div>

        {/* ความเคลื่อนไหวล่าสุด — admin เท่านั้น */}
        {isAdmin && (
          <div>
            <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">📝 ความเคลื่อนไหวล่าสุด</h2>
              <span className="text-xs text-slate-400">5 รายการล่าสุด</span>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[600px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["วิชา / กิจกรรม", "ผู้สอน", "เวลาเรียน", "ห้องเรียน", "จัดการ"].map((h, i) => (
                        <th key={h} className={`px-6 py-4 text-xs font-semibold text-slate-500 uppercase ${i === 4 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dashboardLoading ? (
                      <tr><td colSpan={5} className="py-10 text-center text-slate-400">⏳ กำลังโหลดข้อมูล...</td></tr>
                    ) : schedules.length > 0 ? schedules.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-6 py-4">
                          {item.activity_type === 'meeting' ? (
                            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-orange-50 text-orange-700 text-xs font-bold">🚩 {item.note || "กิจกรรม"}</span>
                          ) : (
                            <div>
                              <div className="font-bold text-slate-800">{item.subjects?.code || "ไม่ระบุ"}</div>
                              <div className="text-xs text-slate-500 truncate max-w-[150px]">{item.subjects?.name}</div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{item.teachers?.full_name || "-"}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs mr-2">{item.day_of_week}</span>คาบที่ {item.slot_id}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{item.classrooms?.name || "-"}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-600 transition p-2 rounded-lg hover:bg-red-50">🗑️</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="py-10 text-center text-slate-400">ยังไม่มีข้อมูลล่าสุด</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

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
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${bg} ${color}`}>{icon}</div>
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