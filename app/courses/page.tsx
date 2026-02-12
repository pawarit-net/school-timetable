"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient"; 

export default function CourseStructurePage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // ฟอร์มเก็บข้อมูล
  const [formData, setFormData] = useState({
    selectedClassrooms: [] as string[],
    subject_id: "",
    teacher_id: "",
    periods: "1",
    year: "2567",
    term: "1"
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      const reqClassrooms = supabase.from("classrooms").select("*").order('id');
      const reqSubjects = supabase.from("subjects").select("*").order('id');
      
      // ✅ แก้ไข: เรียงตาม department ก่อน เพื่อให้ข้อมูลสวยงามเวลาจัดกลุ่ม
      const reqTeachers = supabase.from("teachers").select("*").order('department', { ascending: true }).order('full_name');
      
      const reqCourses = supabase
        .from("course_structures")
        .select(`
          *,
          classrooms ( * ),
          subjects ( * ),
          course_teachers (
            teachers ( * )
          )
        `)
        .order("academic_year", { ascending: false })
        .order("term", { ascending: false })
        .order("created_at", { ascending: false });

      const [resClass, resSubj, resTeach, resCourses] = await Promise.all([
        reqClassrooms,
        reqSubjects,
        reqTeachers,
        reqCourses
      ]);

      if (resClass.data) setClassrooms(resClass.data);
      if (resSubj.data) setSubjects(resSubj.data);
      if (resTeach.data) setTeachers(resTeach.data);
      if (resCourses.data) setCourses(resCourses.data);

    } catch (error) {
      console.error("Error loading data:", error);
      alert("โหลดข้อมูลไม่สำเร็จ กรุณาเช็ค Console");
    } finally {
      setLoading(false);
    }
  };

  // --- ส่วนคำนวณสรุปข้อมูล (Stats) ---
  const stats = useMemo(() => {
    const totalCourses = courses.length;
    // นับจำนวนห้องที่ไม่ซ้ำกัน
    const uniqueRooms = new Set(courses.map(c => c.classroom_id)).size;
    // นับจำนวนครูที่ไม่ซ้ำกัน
    const uniqueTeachers = new Set(courses.flatMap(c => c.course_teachers?.map((t: any) => t.teacher_id))).size;
    // รวมจำนวนคาบทั้งหมด
    const totalPeriods = courses.reduce((sum, c) => sum + (c.periods_per_week || 0), 0);

    return { totalCourses, uniqueRooms, uniqueTeachers, totalPeriods };
  }, [courses]);


  const toggleClassroom = (id: string) => {
    setFormData(prev => {
      const isSelected = prev.selectedClassrooms.includes(id);
      if (isSelected) {
        return { ...prev, selectedClassrooms: prev.selectedClassrooms.filter(cid => cid !== id) };
      } else {
        return { ...prev, selectedClassrooms: [...prev.selectedClassrooms, id] };
      }
    });
  };

  const toggleAllClassrooms = () => {
    if (formData.selectedClassrooms.length === classrooms.length) {
      setFormData({ ...formData, selectedClassrooms: [] });
    } else {
      setFormData({ ...formData, selectedClassrooms: classrooms.map(c => c.id.toString()) });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.selectedClassrooms.length === 0 || !formData.subject_id || !formData.teacher_id) {
      alert("กรุณาเลือกข้อมูลให้ครบถ้วน");
      return;
    }

    try {
      setLoading(true);
      const promises = formData.selectedClassrooms.map(async (classroomId) => {
        const { data: courseData, error: courseError } = await supabase
          .from("course_structures")
          .insert({
            classroom_id: parseInt(classroomId),
            subject_id: parseInt(formData.subject_id),
            periods_per_week: parseInt(formData.periods),
            academic_year: formData.year,
            term: formData.term
          })
          .select()
          .single();

        if (courseError) throw courseError;

        if (courseData) {
          const { error: teacherError } = await supabase
            .from("course_teachers")
            .insert({
              course_structure_id: courseData.id,
              teacher_id: parseInt(formData.teacher_id)
            });
          if (teacherError) throw teacherError;
        }
      });

      await Promise.all(promises);
      setShowModal(false);
      setFormData({ ...formData, selectedClassrooms: [] });
      fetchAllData(); 
      
    } catch (error: any) {
      console.error("Save Error:", error);
      alert("บันทึกไม่ผ่านบางรายการ: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("⚠️ ต้องการลบรายวิชานี้ใช่ไหม?")) return;
    const { error } = await supabase.from("course_structures").delete().eq("id", id);
    if (error) alert("ลบไม่สำเร็จ: " + error.message);
    else fetchAllData();
  };

  const getTeacherName = (t: any) => t ? (t.full_name || t.name || "ครู") : "-";

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-800">
      
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              โครงสร้างรายวิชา
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              จัดการวิชาที่สอนในแต่ละห้องเรียน ครูผู้สอน และจำนวนคาบ
            </p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition shadow-sm hover:shadow-md active:scale-95 font-medium flex items-center gap-2"
          >
            <span>+</span> เพิ่มวิชาใหม่
          </button>
        </div>

        {/* --- ส่วนสรุปข้อมูล (Stats Dashboard) --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
             <div className="text-3xl font-bold text-indigo-600 mb-1">{stats.totalCourses}</div>
             <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">รายการวิชาทั้งหมด</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
             <div className="text-3xl font-bold text-emerald-600 mb-1">{stats.uniqueRooms}</div>
             <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">ห้องที่จัดตารางแล้ว</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
             <div className="text-3xl font-bold text-amber-500 mb-1">{stats.uniqueTeachers}</div>
             <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">ครูที่มีสอน</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
             <div className="text-3xl font-bold text-slate-700 mb-1">{stats.totalPeriods}</div>
             <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">รวมคาบ/สัปดาห์</div>
          </div>
        </div>

        {/* Content Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              กำลังโหลดข้อมูล...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ปี/เทอม</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ห้องเรียน</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">วิชา</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ครูผู้สอน</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">คาบ</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {courses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        ยังไม่มีข้อมูลรายวิชาในระบบ
                      </td>
                    </tr>
                  ) : (
                    courses.map((course) => (
                      <tr key={course.id} className="hover:bg-slate-50/50 transition duration-150">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            {course.term}/{course.academic_year}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {course.classrooms?.name || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800">{course.subjects?.code}</span>
                            <span className="text-xs text-slate-500">{course.subjects?.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {course.course_teachers?.map((ct: any) => (
                            <div key={ct.id} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-700 font-bold">
                                {getTeacherName(ct.teachers).charAt(0)}
                              </div>
                              {getTeacherName(ct.teachers)}
                            </div>
                          ))}
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-medium text-slate-600">
                          {course.periods_per_week}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleDelete(course.id)} 
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                            title="ลบรายการ"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modern Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-white/50 animate-fade-in">
            
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-slate-800">เพิ่มรายวิชาใหม่</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {/* Classroom Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  ห้องเรียน <span className="text-slate-400 font-normal">({formData.selectedClassrooms.length} ห้องที่เลือก)</span>
                </label>
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-40 overflow-y-auto custom-scrollbar">
                   <div className="flex justify-between items-center mb-2 px-1">
                      <span className="text-xs text-slate-500">เลือกห้องที่เรียนวิชานี้เหมือนกัน</span>
                      <button type="button" onClick={toggleAllClassrooms} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                        {formData.selectedClassrooms.length === classrooms.length ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                      </button>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                     {classrooms.map(c => (
                       <label key={c.id} className={`
                          flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition text-sm border
                          ${formData.selectedClassrooms.includes(c.id.toString()) 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900' 
                            : 'bg-white border-transparent hover:border-slate-200 text-slate-600'}
                       `}>
                         <input 
                           type="checkbox" 
                           className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                           checked={formData.selectedClassrooms.includes(c.id.toString())}
                           onChange={() => toggleClassroom(c.id.toString())} 
                         />
                         <span>{c.name}</span>
                       </label>
                     ))}
                   </div>
                </div>
              </div>

              {/* Subject & Teacher */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">วิชา</label>
                  <select 
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={formData.subject_id} 
                    onChange={e => setFormData({...formData, subject_id: e.target.value})} 
                    required
                  >
                    <option value="">-- เลือกรายวิชา --</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>({s.code}) {s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ครูผู้สอน</label>
                  <select 
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={formData.teacher_id} 
                    onChange={e => setFormData({...formData, teacher_id: e.target.value})} 
                    required
                  >
                    <option value="">-- เลือกครู --</option>
                    {/* ✅ แก้ไข: วนลูปแสดงผลแบบจัดกลุ่มตาม department (ใช้ optgroup) */}
                    {Object.entries(
                      teachers.reduce((acc: any, t: any) => {
                        const dept = t.department || 'ทั่วไป'; // ถ้าไม่มีหมวด ให้เป็น 'ทั่วไป'
                        if (!acc[dept]) acc[dept] = [];
                        acc[dept].push(t);
                        return acc;
                      }, {})
                    ).map(([dept, teachersInDept]: [string, any]) => (
                      <optgroup key={dept} label={`📂 ${dept}`}>
                        {teachersInDept.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {getTeacherName(t)} {t.nickname ? `(${t.nickname})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-1">เทอม</label>
                   <select 
                     className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                     value={formData.term} 
                     onChange={e => setFormData({...formData, term: e.target.value})}
                   >
                     <option value="1">1</option>
                     <option value="2">2</option>
                     <option value="3">Summer</option>
                   </select>
                </div>
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-1">ปีการศึกษา</label>
                   <input 
                     type="text" 
                     className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                     value={formData.year} 
                     onChange={e => setFormData({...formData, year: e.target.value})} 
                   />
                </div>
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-1">คาบ/วีค</label>
                   <input 
                     type="number" 
                     min="1" 
                     className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-center"
                     value={formData.periods} 
                     onChange={e => setFormData({...formData, periods: e.target.value})} 
                   />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-sm hover:shadow active:scale-95 transition"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}