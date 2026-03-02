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
  const [editingCourse, setEditingCourse] = useState<any>(null); // null = add, object = edit
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Filters
  const [filterYear, setFilterYear] = useState("all");
  const [filterTerm, setFilterTerm] = useState("all");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterTeacher, setFilterTeacher] = useState("all");

  const [formData, setFormData] = useState({
    selectedClassrooms: [] as string[],
    subject_id: "",
    teacher_id: "",
    periods: "1",
    year: "2567",
    term: "1",
  });

  useEffect(() => { fetchAllData(); }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [resClass, resSubj, resTeach, resCourses] = await Promise.all([
        supabase.from("classrooms").select("*").order("id"),
        supabase.from("subjects").select("*").order("id"),
        supabase.from("teachers").select("*").order("department", { ascending: true }).order("full_name"),
        supabase.from("course_structures").select(`
          *, classrooms(*), subjects(*),
          course_teachers(id, teacher_id, teachers(*))
        `).order("academic_year", { ascending: false }).order("term", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (resClass.data) setClassrooms(resClass.data);
      if (resSubj.data) setSubjects(resSubj.data);
      if (resTeach.data) setTeachers(resTeach.data);
      if (resCourses.data) setCourses(resCourses.data);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => ({
    totalCourses: courses.length,
    uniqueRooms: new Set(courses.map(c => c.classroom_id)).size,
    uniqueTeachers: new Set(courses.flatMap(c => c.course_teachers?.map((t: any) => t.teacher_id))).size,
    totalPeriods: courses.reduce((sum, c) => sum + (c.periods_per_week || 0), 0),
  }), [courses]);

  // Unique values for filter dropdowns
  const filterYears = useMemo(() => [...new Set(courses.map(c => c.academic_year))].sort().reverse(), [courses]);
  const filterTerms = useMemo(() => [...new Set(courses.map(c => c.term))].sort(), [courses]);

  // Filtered courses
  const filteredCourses = useMemo(() => courses.filter(c => {
    if (filterYear !== "all" && c.academic_year !== filterYear) return false;
    if (filterTerm !== "all" && String(c.term) !== String(filterTerm)) return false;
    if (filterRoom !== "all" && String(c.classroom_id) !== String(filterRoom)) return false;
    if (filterTeacher !== "all" && !c.course_teachers?.some((ct: any) => String(ct.teacher_id) === String(filterTeacher))) return false;
    return true;
  }), [courses, filterYear, filterTerm, filterRoom, filterTeacher]);

  const toggleClassroom = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedClassrooms: prev.selectedClassrooms.includes(id)
        ? prev.selectedClassrooms.filter(cid => cid !== id)
        : [...prev.selectedClassrooms, id],
    }));
  };

  const toggleAllClassrooms = () => {
    setFormData(prev => ({
      ...prev,
      selectedClassrooms: prev.selectedClassrooms.length === classrooms.length ? [] : classrooms.map(c => c.id.toString()),
    }));
  };

  const openAddModal = () => {
    setEditingCourse(null);
    setFormData({ selectedClassrooms: [], subject_id: "", teacher_id: "", periods: "1", year: "2567", term: "1" });
    setShowModal(true);
  };

  const openEditModal = (course: any) => {
    setEditingCourse(course);
    setFormData({
      selectedClassrooms: [String(course.classroom_id)],
      subject_id: String(course.subject_id),
      teacher_id: String(course.course_teachers?.[0]?.teacher_id || ""),
      periods: String(course.periods_per_week || 1),
      year: String(course.academic_year),
      term: String(course.term),
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse && formData.selectedClassrooms.length === 0) return;
    if (!formData.subject_id || !formData.teacher_id) return;

    try {
      setLoading(true);

      if (editingCourse) {
        // Update mode
        const { error: updateError } = await supabase.from("course_structures").update({
          subject_id: parseInt(formData.subject_id),
          periods_per_week: parseInt(formData.periods),
          academic_year: formData.year,
          term: formData.term,
        }).eq("id", editingCourse.id);
        if (updateError) throw updateError;

        // Update teacher: delete old, insert new
        await supabase.from("course_teachers").delete().eq("course_structure_id", editingCourse.id);
        await supabase.from("course_teachers").insert({
          course_structure_id: editingCourse.id,
          teacher_id: parseInt(formData.teacher_id),
        });
      } else {
        // Insert mode (multiple rooms)
        await Promise.all(formData.selectedClassrooms.map(async (classroomId) => {
          const { data: courseData, error: courseError } = await supabase.from("course_structures").insert({
            classroom_id: parseInt(classroomId),
            subject_id: parseInt(formData.subject_id),
            periods_per_week: parseInt(formData.periods),
            academic_year: formData.year,
            term: formData.term,
          }).select().single();
          if (courseError) throw courseError;
          if (courseData) {
            const { error: teacherError } = await supabase.from("course_teachers").insert({
              course_structure_id: courseData.id,
              teacher_id: parseInt(formData.teacher_id),
            });
            if (teacherError) throw teacherError;
          }
        }));
      }

      setShowModal(false);
      setEditingCourse(null);
      await fetchAllData();
    } catch (error: any) {
      console.error("Save Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("course_structures").delete().eq("id", id);
    if (!error) {
      setDeleteConfirmId(null);
      await fetchAllData();
    }
  };

  const getTeacherName = (t: any) => t ? (t.full_name || t.name || "ครู") : "-";

  const teacherGrouped = useMemo(() => Object.entries(
    teachers.reduce((acc: any, t: any) => {
      const dept = t.department || "ทั่วไป";
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(t);
      return acc;
    }, {})
  ), [teachers]);

  const activeFiltersCount = [filterYear, filterTerm, filterRoom, filterTeacher].filter(f => f !== "all").length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">โครงสร้างรายวิชา</h1>
            <p className="text-slate-500 text-sm mt-1">จัดการวิชาที่สอนในแต่ละห้องเรียน ครูผู้สอน และจำนวนคาบ</p>
          </div>
          <button onClick={openAddModal} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition shadow-sm font-medium flex items-center gap-2">
            <span>+</span> เพิ่มวิชาใหม่
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: stats.totalCourses, label: "รายการวิชาทั้งหมด", color: "text-indigo-600" },
            { value: stats.uniqueRooms, label: "ห้องที่จัดตารางแล้ว", color: "text-emerald-600" },
            { value: stats.uniqueTeachers, label: "ครูที่มีสอน", color: "text-amber-500" },
            { value: stats.totalPeriods, label: "รวมคาบ/สัปดาห์", color: "text-slate-700" },
          ].map(s => (
            <div key={s.label} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
              <div className={`text-3xl font-bold mb-1 ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              🔍 กรอง
              {activeFiltersCount > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">{activeFiltersCount}</span>
              )}
            </div>

            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 ring-indigo-300"
              value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="all">ทุกปีการศึกษา</option>
              {filterYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
            </select>

            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 ring-indigo-300"
              value={filterTerm} onChange={e => setFilterTerm(e.target.value)}>
              <option value="all">ทุกภาคเรียน</option>
              {filterTerms.map(t => <option key={t} value={t}>เทอม {t}</option>)}
            </select>

            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 ring-indigo-300"
              value={filterRoom} onChange={e => setFilterRoom(e.target.value)}>
              <option value="all">ทุกห้องเรียน</option>
              {classrooms.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>

            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 ring-indigo-300"
              value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
              <option value="all">ทุกครูผู้สอน</option>
              {teachers.map(t => <option key={t.id} value={String(t.id)}>{t.full_name}</option>)}
            </select>

            {activeFiltersCount > 0 && (
              <button onClick={() => { setFilterYear("all"); setFilterTerm("all"); setFilterRoom("all"); setFilterTeacher("all"); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition border border-red-200">
                ล้างตัวกรอง
              </button>
            )}

            <span className="ml-auto text-xs text-slate-400 font-medium">
              แสดง {filteredCourses.length} / {courses.length} รายการ
            </span>
          </div>
        </div>

        {/* Table */}
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
                    {["ปี/เทอม", "ห้องเรียน", "วิชา", "ครูผู้สอน", "คาบ", "จัดการ"].map(h => (
                      <th key={h} className={`px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider ${h === "คาบ" ? "text-center" : h === "จัดการ" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredCourses.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-400">ไม่พบข้อมูลที่ตรงกับตัวกรอง</td></tr>
                  ) : (
                    filteredCourses.map(course => (
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
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openEditModal(course)}
                              className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition" title="แก้ไข">
                              ✏️
                            </button>
                            <button onClick={() => setDeleteConfirmId(String(course.id))}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition" title="ลบ">
                              🗑️
                            </button>
                          </div>
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-white/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">
                {editingCourse ? "✏️ แก้ไขรายวิชา" : "➕ เพิ่มรายวิชาใหม่"}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingCourse(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

              {/* ห้องเรียน — ซ่อนถ้า edit mode */}
              {!editingCourse && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    ห้องเรียน <span className="text-slate-400 font-normal">({formData.selectedClassrooms.length} ห้องที่เลือก)</span>
                  </label>
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-40 overflow-y-auto">
                    <div className="flex justify-between items-center mb-2 px-1">
                      <span className="text-xs text-slate-500">เลือกห้องที่เรียนวิชานี้เหมือนกัน</span>
                      <button type="button" onClick={toggleAllClassrooms} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                        {formData.selectedClassrooms.length === classrooms.length ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {classrooms.map(c => (
                        <label key={c.id} className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition text-sm border ${formData.selectedClassrooms.includes(c.id.toString()) ? "bg-indigo-50 border-indigo-200 text-indigo-900" : "bg-white border-transparent hover:border-slate-200 text-slate-600"}`}>
                          <input type="checkbox" className="rounded text-indigo-600" checked={formData.selectedClassrooms.includes(c.id.toString())} onChange={() => toggleClassroom(c.id.toString())} />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {editingCourse && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold">ห้องเรียน:</span> {editingCourse.classrooms?.name}
                </div>
              )}

              {/* วิชา */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">วิชา</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  value={formData.subject_id} onChange={e => setFormData({ ...formData, subject_id: e.target.value })} required>
                  <option value="">-- เลือกรายวิชา --</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>({s.code}) {s.name}</option>)}
                </select>
              </div>

              {/* ครู */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ครูผู้สอน</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  value={formData.teacher_id} onChange={e => setFormData({ ...formData, teacher_id: e.target.value })} required>
                  <option value="">-- เลือกครู --</option>
                  {teacherGrouped.map(([dept, list]: [string, any]) => (
                    <optgroup key={dept} label={`📂 ${dept}`}>
                      {list.map((t: any) => <option key={t.id} value={t.id}>{getTeacherName(t)}{t.nickname ? ` (${t.nickname})` : ""}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">เทอม</label>
                  <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={formData.term} onChange={e => setFormData({ ...formData, term: e.target.value })}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">Summer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ปีการศึกษา</label>
                  <input type="text" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">คาบ/วีค</label>
                  <input type="number" min="1" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-center"
                    value={formData.periods} onChange={e => setFormData({ ...formData, periods: e.target.value })} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setShowModal(false); setEditingCourse(null); }}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition">ยกเลิก</button>
                <button type="submit" disabled={loading}
                  className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-sm transition disabled:opacity-50">
                  {editingCourse ? "บันทึกการแก้ไข" : "บันทึกข้อมูล"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Inline Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border p-6 text-center space-y-4">
            <div className="text-4xl">🗑️</div>
            <div className="font-bold text-slate-800 text-lg">ยืนยันการลบ?</div>
            <p className="text-sm text-slate-500">รายวิชานี้จะถูกลบออกจากระบบ ไม่สามารถกู้คืนได้</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => handleDelete(deleteConfirmId)} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600">ลบเลย</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}