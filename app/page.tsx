"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [academicInfo, setAcademicInfo] = useState({ year: "2567", semester: "1" });
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, assignments: 0, courses: 0 });
  const [schedules, setSchedules] = useState<any[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // --- 1. ตรวจสอบ session จาก localStorage ---
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("teacher_session") : null;
    if (saved) {
      setSession(JSON.parse(saved));
      fetchStats();
      fetchSchedules();
    }
    setAuthLoading(false);
  }, []);

  // --- 2. Login: ตรวจ teachers table เท่านั้น ไม่ใช้ Supabase Auth ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    try {
      const { data: teacher, error: dbError } = await supabase
        .from("teachers")
        .select("*")
        .ilike("email", cleanEmail)
        .eq("teacher_code", cleanPassword)
        .maybeSingle();
      if (dbError || !teacher) {
        setLoginError("อีเมลหรือรหัสประจำตัวไม่ถูกต้อง");
        return;
      }
      const sessionData = { id: teacher.id, full_name: teacher.full_name, email: teacher.email, role: teacher.role };
      localStorage.setItem("teacher_session", JSON.stringify(sessionData));
      setSession(sessionData);
      fetchStats();
      fetchSchedules();
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- 3. Logout ---
  const handleLogout = () => {
    localStorage.removeItem("teacher_session");
    setSession(null);
    setEmail("");
    setPassword("");
  };

  async function fetchStats() {
    const { data: settings } = await supabase.from("academic_settings").select("*").limit(1).single();
    if (settings) {
      setAcademicInfo({ year: settings.year?.toString() || "2567", semester: settings.semester || "1" });
    }
    const { count: tCount } = await supabase.from("teachers").select("*", { count: 'exact', head: true });
    const { count: sCount } = await supabase.from("subjects").select("*", { count: 'exact', head: true });
    const { count: cCount } = await supabase.from("course_structures").select("*", { count: 'exact', head: true });
    const { count: aCount } = await supabase.from("teaching_assignments").select("*", { count: 'exact', head: true });
    setStats({ teachers: tCount || 0, subjects: sCount || 0, courses: cCount || 0, assignments: aCount || 0 });
  }

  async function fetchSchedules() {
    setDashboardLoading(true);
    const { data, error } = await supabase
      .from("teaching_assignments")
      .select(`id, day_of_week, slot_id, activity_type, note, subjects (code, name), teachers (full_name), classrooms (name)`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!error) setSchedules(data || []);
    setDashboardLoading(false);
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from("teaching_assignments").delete().eq("id", id);
    if (!error) { fetchSchedules(); fetchStats(); }
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">กำลังตรวจสอบข้อมูล...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md border border-slate-100">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-xl mx-auto flex items-center justify-center text-3xl mb-4">🏫</div>
            <h1 className="text-2xl font-bold text-slate-800">เข้าสู่ระบบ</h1>
            <p className="text-slate-500 text-sm mt-1">School Scheduler System</p>
          </div>
          {loginError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
              🚨 {loginError}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">อีเมลโรงเรียน</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@school.ac.th"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-slate-800 bg-white [&:-webkit-autofill]:[-webkit-text-fill-color:#1e293b] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_white_inset]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">รหัสประจำตัว (teacher_code)</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสประจำตัว..."
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-slate-800 bg-white [&:-webkit-autofill]:[-webkit-text-fill-color:#1e293b] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_white_inset]" />
            </div>
            <button type="submit" disabled={isLoggingIn}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoggingIn ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-6">หากพบปัญหาในการใช้งาน กรุณาติดต่อฝ่ายวิชาการ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <Link href="/" className="hover:opacity-75 transition-opacity">
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  🏫 <span className="hidden md:inline">School Scheduler</span>
                  <span className="md:hidden">Scheduler</span>
                </h1>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 px-4 py-2 rounded-xl text-indigo-700 font-medium text-sm flex items-center gap-2 border border-indigo-100">
                <span>👤 {session.full_name}</span>
                <span className="w-1 h-4 bg-indigo-200 mx-1"></span>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="ครูทั้งหมด" value={stats.teachers} unit="คน" icon="👨‍🏫" color="text-blue-600" bg="bg-blue-50" />
          <StatCard title="รายวิชา" value={stats.subjects} unit="วิชา" icon="📚" color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard title="โครงสร้างวิชา" value={stats.courses} unit="รายการ" icon="🗓️" color="text-indigo-600" bg="bg-indigo-50" />
          <StatCard title="ตารางสอน" value={stats.assignments} unit="คาบ" icon="⚡" color="text-amber-600" bg="bg-amber-50" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">🚀 เมนูจัดการ</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/courses" className="group p-6 bg-white rounded-2xl border border-indigo-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all ring-4 ring-indigo-50/50">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🗓️</div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600">จัดโครงสร้างรายวิชา</h3>
              <p className="text-sm text-slate-500 mt-1">จับคู่ วิชา + ครู + ห้องเรียน</p>
            </Link>
            <Link href="/manage-assignments" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🏫</div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">จัดตารางสอน (Drag & Drop)</h3>
              <p className="text-sm text-slate-500 mt-1">ลงคาบเรียนรายห้อง</p>
            </Link>
            <Link href="/teacher-schedule" className="group p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">👤</div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600">ตารางสอนรายบุคคล</h3>
              <p className="text-sm text-slate-500 mt-1">ตรวจสอบตารางสอนของครู</p>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <MiniMenu href="/manage-teachers" icon="👨‍🏫" label="ข้อมูลครู" />
            <MiniMenu href="/manage-subjects" icon="📚" label="ข้อมูลวิชา" />
            <MiniMenu href="/manage-classrooms" icon="🏢" label="ห้องเรียน" />
            <MiniMenu href="/settings" icon="⚙️" label="ตั้งค่าระบบ" />
          </div>
        </div>

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
                        <td className="px-6 py-4 text-sm text-slate-600">{item.teachers?.full_name || "-"}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs mr-2">{item.day_of_week}</span>
                          คาบที่ {item.slot_id}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{item.classrooms?.name || "-"}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-600 transition p-2 rounded-lg hover:bg-red-50">🗑️</button>
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