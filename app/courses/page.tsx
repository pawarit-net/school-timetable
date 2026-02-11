"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase"; 

export default function CourseStructurePage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [majorGroups, setMajorGroups] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // ✅ 1. State สำหรับ Modal คัดลอกเทอม (Clone)
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneConfig, setCloneConfig] = useState({
    fromYear: "2567", fromTerm: "1",
    toYear: "2567", toTerm: "2"
  });

  // ✅ 2. State สำหรับโหมดแก้ไข (Edit)
  const [editingId, setEditingId] = useState<string | null>(null);

  // ฟอร์มเก็บข้อมูล
  const [formData, setFormData] = useState({
    selectedClassrooms: [] as string[],
    subject_id: "",
    teacher_id: "",
    periods: "1",
    year: "2567",
    term: "1",
    major_group_id: 1 
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      const reqClassrooms = supabase.from("classrooms").select("*").order('id');
      const reqSubjects = supabase.from("subjects").select("*").order('code');
      const reqTeachers = supabase.from("teachers").select("*").order('id');
      const reqMajorGroups = supabase.from("major_groups").select("*").order('id');
      
      const reqCourses = supabase
        .from("course_structures")
        .select(`
          *,
          classrooms ( name ),
          subjects ( code, name ),
          major_groups ( name ), 
          course_teachers (
            teacher_id,
            teachers ( full_name, id )
          )
        `)
        .order("academic_year", { ascending: false })
        .order("term", { ascending: false })
        .order("created_at", { ascending: false });

      const [resClass, resSubj, resTeach, resGroups, resCourses] = await Promise.all([
        reqClassrooms,
        reqSubjects,
        reqTeachers,
        reqMajorGroups,
        reqCourses
      ]);

      if (resClass.data) setClassrooms(resClass.data);
      if (resSubj.data) setSubjects(resSubj.data);
      if (resTeach.data) setTeachers(resTeach.data);
      if (resGroups.data) setMajorGroups(resGroups.data);
      if (resCourses.data) setCourses(resCourses.data);

    } catch (error) {
      console.error("Error loading data:", error);
      alert("โหลดข้อมูลไม่สำเร็จ กรุณาเช็ค Console");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 3. ฟังก์ชันเปิด Modal เพื่อแก้ไข (Handle Edit)
  const handleEdit = (course: any) => {
    setEditingId(course.id); // Set ID ที่กำลังแก้

    // หา ID ครูคนแรก (ถ้ามี)
    const currentTeacherId = course.course_teachers?.[0]?.teacher_id || "";

    setFormData({
      selectedClassrooms: [course.classroom_id.toString()], // ติ๊กถูกเฉพาะห้องของวิชานั้น
      subject_id: course.subject_id.toString(),
      teacher_id: currentTeacherId.toString(),
      periods: course.periods_per_week.toString(),
      year: course.academic_year,
      term: course.term,
      major_group_id: course.major_group_id || 1
    });

    setShowModal(true);
  };

  // ✅ 4. ฟังก์ชันปิด Modal (Close & Reset)
  const closeModal = () => {
    setShowModal(false);
    setEditingId(null); // ล้างสถานะแก้ไข
    setFormData(prev => ({ 
      ...prev, 
      selectedClassrooms: [], 
      subject_id: "", 
      teacher_id: "",
      periods: "1",
      major_group_id: 1 
    }));
  };

  // ✅ 5. ฟังก์ชันบันทึก (รองรับทั้ง Create และ Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.selectedClassrooms.length === 0 || !formData.subject_id || !formData.teacher_id) {
      alert("กรุณาเลือกข้อมูลให้ครบถ้วน");
      return;
    }

    setLoading(true);
    try {
      // --- กรณีแก้ไข (Update) ---
      if (editingId) {
        // 1. อัปเดตข้อมูลรายวิชา
        const { error: updateError } = await supabase
          .from("course_structures")
          .update({
            classroom_id: parseInt(formData.selectedClassrooms[0]), // แก้ไขห้องได้ห้องเดียว
            subject_id: parseInt(formData.subject_id),
            periods_per_week: parseInt(formData.periods),
            academic_year: formData.year,
            term: formData.term,
            major_group_id: formData.major_group_id
          })
          .eq("id", editingId);

        if (updateError) throw updateError;

        // 2. อัปเดตครู (ลบเก่า -> ใส่ใหม่)
        await supabase.from("course_teachers").delete().eq("course_structure_id", editingId);
        await supabase.from("course_teachers").insert({
            course_structure_id: editingId,
            teacher_id: parseInt(formData.teacher_id)
        });

      } else {
        // --- กรณีเพิ่มใหม่ (Insert Loop) ---
        const promises = formData.selectedClassrooms.map(async (classroomId) => {
          const { data: courseData, error: courseError } = await supabase
            .from("course_structures")
            .insert({
              classroom_id: parseInt(classroomId),
              subject_id: parseInt(formData.subject_id),
              periods_per_week: parseInt(formData.periods),
              academic_year: formData.year,
              term: formData.term,
              major_group_id: formData.major_group_id || 1 
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
      }

      closeModal(); 
      fetchAllData(); 
      
    } catch (error: any) {
      console.error("Save Error:", error);
      alert("เกิดข้อผิดพลาด: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // ✅ 6. ฟังก์ชันจัดการการคัดลอก (Copy Logic)
  const handleCloneCourses = async () => {
    if (!confirm(`ยืนยันการคัดลอกข้อมูลจาก ${cloneConfig.fromTerm}/${cloneConfig.fromYear} ไปยัง ${cloneConfig.toTerm}/${cloneConfig.toYear} ?\n\n(ข้อมูลที่มีอยู่แล้วในเทอมปลายทางจะไม่ถูกลบ)`)) {
      return;
    }

    setLoading(true);
    try {
      // ดึงข้อมูลต้นทาง
      const { data: sourceCourses, error: sourceError } = await supabase
        .from("course_structures")
        .select(`*, course_teachers ( teacher_id )`)
        .eq("academic_year", cloneConfig.fromYear)
        .eq("term", cloneConfig.fromTerm);

      if (sourceError) throw sourceError;
      if (!sourceCourses || sourceCourses.length === 0) {
        alert("ไม่พบข้อมูลในเทอมต้นทาง");
        setLoading(false);
        return;
      }

      let successCount = 0;
      for (const course of sourceCourses) {
        // เช็คซ้ำ
        const { data: existing } = await supabase
            .from("course_structures")
            .select("id")
            .eq("classroom_id", course.classroom_id)
            .eq("subject_id", course.subject_id)
            .eq("academic_year", cloneConfig.toYear)
            .eq("term", cloneConfig.toTerm)
            .maybeSingle();

        if (existing) continue;

        // Insert ใหม่
        const { data: newCourse, error: insertError } = await supabase
          .from("course_structures")
          .insert({
            classroom_id: course.classroom_id,
            subject_id: course.subject_id,
            periods_per_week: course.periods_per_week,
            major_group_id: course.major_group_id,
            academic_year: cloneConfig.toYear,
            term: cloneConfig.toTerm
          })
          .select()
          .single();

        if (insertError) {
            console.error("Failed to copy course:", insertError);
            continue;
        }

        if (newCourse && course.course_teachers?.length > 0) {
            const teachersToInsert = course.course_teachers.map((t: any) => ({
                course_structure_id: newCourse.id,
                teacher_id: t.teacher_id
            }));
            await supabase.from("course_teachers").insert(teachersToInsert);
        }
        successCount++;
      }

      alert(`✅ คัดลอกเสร็จสิ้น! นำเข้าสำเร็จ ${successCount} รายวิชา`);
      setShowCloneModal(false);
      fetchAllData();

    } catch (error: any) {
      console.error("Clone Error:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
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

  // --- Helpers ---
  const stats = useMemo(() => {
    const totalCourses = courses.length;
    const uniqueRooms = new Set(courses.map(c => c.classroom_id)).size;
    const uniqueTeachers = new Set(courses.flatMap(c => c.course_teachers?.map((t: any) => t.teacher_id))).size;
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

  const getTeacherName = (t: any) => t ? (t.full_name || t.name || "ครู") : "-";

  // 👇 [ใหม่] Logic จัดกลุ่มครูตาม department
  const groupedTeachers = useMemo(() => {
    return teachers.reduce((acc, teacher) => {
      // ใช้ department เป็น key ถ้าไม่มีให้ใช้ "ไม่ระบุหมวด"
      const dept = teacher.department || "ไม่ระบุหมวด"; 
      if (!acc[dept]) {
        acc[dept] = [];
      }
      acc[dept].push(teacher);
      return acc;
    }, {} as Record<string, any[]>);
  }, [teachers]);

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
              จัดการวิชาที่สอนในแต่ละห้องเรียน ครูผู้สอน และแผนการเรียน
            </p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setShowCloneModal(true)}
              className="bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition shadow-sm font-medium flex items-center gap-2"
            >
              📋 คัดลอกข้ามเทอม
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition shadow-sm hover:shadow-md active:scale-95 font-medium flex items-center gap-2"
            >
              <span>+</span> เพิ่มวิชาใหม่
            </button>
          </div>
        </div>

        {/* Stats Dashboard */}
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
                <thead className="bg-slate-50/80"><tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ปี/เทอม</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ห้องเรียน</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">วิชา</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">แผนการเรียน</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ครูผู้สอน</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">คาบ</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">จัดการ</th>
                  </tr></thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {courses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-900">
                          {course.classrooms?.name || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800">{course.subjects?.code}</span>
                            <span className="text-xs text-slate-500">{course.subjects?.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                           {course.major_group_id === 1 ? (
                              <span className="text-slate-400 text-xs border px-2 py-1 rounded">ปกติ (ทั้งห้อง)</span>
                            ) : (
                              <span className="text-orange-600 text-xs bg-orange-50 px-2 py-1 rounded font-bold border border-orange-100">
                                {course.major_groups?.name || "ไม่ระบุ"}
                              </span>
                            )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {course.course_teachers?.map((ct: any, index: number) => (
                            <div key={`${ct.id}-${index}`} className="flex items-center gap-2 mb-1">
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
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {/* ✅ ปุ่มแก้ไข */}
                          <button 
                            onClick={() => handleEdit(course)}
                            className="text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 p-2 rounded-lg transition mr-2"
                            title="แก้ไข"
                          >
                            ✏️
                          </button>
                          
                          {/* ปุ่มลบ */}
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

      {/* Main Modal (Add / Edit) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-white/50 animate-fade-in">
            
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              {/* ✅ เปลี่ยนหัวข้อตามสถานะ */}
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "✏️ แก้ไขข้อมูลรายวิชา" : "+ เพิ่มรายวิชาใหม่"}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {/* Classroom Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  ห้องเรียน <span className="text-slate-400 font-normal">({formData.selectedClassrooms.length} ห้องที่เลือก)</span>
                </label>
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-40 overflow-y-auto custom-scrollbar">
                   {/* แสดงปุ่มเลือกทั้งหมดเฉพาะตอนเพิ่มใหม่ (ไม่ใช่ตอนแก้ไข) */}
                   {!editingId && (
                     <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-xs text-slate-500">เลือกห้องที่เรียนเหมือนกัน</span>
                        <button type="button" onClick={toggleAllClassrooms} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                          {formData.selectedClassrooms.length === classrooms.length ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                        </button>
                     </div>
                   )}
                   
                   <div className="grid grid-cols-2 gap-2">
                     {classrooms.map(c => (
                       <label key={c.id} className={`
                          flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition text-sm border
                          ${formData.selectedClassrooms.includes(c.id.toString()) 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900' 
                            : 'bg-white border-transparent hover:border-slate-200 text-slate-600'}
                          ${editingId && !formData.selectedClassrooms.includes(c.id.toString()) ? 'opacity-50 pointer-events-none' : ''} 
                       `}>
                         <input 
                           type="checkbox" 
                           className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                           checked={formData.selectedClassrooms.includes(c.id.toString())}
                           // ถ้าโหมดแก้ไข ให้เลือกได้แค่ห้องเดียว (ล็อกไว้)
                           onChange={() => !editingId && toggleClassroom(c.id.toString())} 
                           disabled={!!editingId && !formData.selectedClassrooms.includes(c.id.toString())}
                         />
                         <span>{c.name}</span>
                       </label>
                     ))}
                   </div>
                </div>
              </div>

              {/* Subject, Teacher, Plan */}
              <div className="space-y-4">
                {/* 1. เลือกวิชา */}
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

                {/* 2. เลือกแผนการเรียน */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    กลุ่มเรียน / แผนการเรียน 
                  </label>
                  <select 
                    className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50"
                    value={formData.major_group_id} 
                    onChange={e => setFormData({...formData, major_group_id: Number(e.target.value)})} 
                  >
                    {majorGroups.map(group => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">* เลือก "ห้องเรียนปกติ" หากเรียนรวมทั้งห้อง</p>
                </div>

                {/* 3. เลือกครู (✅ ปรับปรุง: แสดงแบบแยกหมวด) */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ครูผู้สอน</label>
                  <select 
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={formData.teacher_id} 
                    onChange={e => setFormData({...formData, teacher_id: e.target.value})} 
                    required
                  >
                    <option value="">-- เลือกครู --</option>
                    
                    {/* 👇 ใช้ข้อมูลที่ Group แล้วมาแสดงผล และ Fix as any[] แล้ว */}
                    {Object.entries(groupedTeachers).map(([dept, teachersInDept]) => (
                      <optgroup key={dept} label={dept}>
                        {(teachersInDept as any[]).map((t) => (
                          <option key={t.id} value={t.id}>
                            {getTeacherName(t)}
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
                  onClick={closeModal} 
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-sm hover:shadow active:scale-95 transition"
                >
                  {editingId ? "บันทึกการแก้ไข" : "บันทึกข้อมูล"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">คัดลอกข้อมูลรายวิชา</h3>
              <button onClick={() => setShowCloneModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* ต้นทาง */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">ต้นทาง (Copy From)</label>
                <div className="flex gap-3">
                  <input 
                    type="text" placeholder="ปี" className="w-1/2 p-2 border rounded-lg text-center"
                    value={cloneConfig.fromYear}
                    onChange={e => setCloneConfig({...cloneConfig, fromYear: e.target.value})}
                  />
                  <select 
                    className="w-1/2 p-2 border rounded-lg text-center bg-white"
                    value={cloneConfig.fromTerm}
                    onChange={e => setCloneConfig({...cloneConfig, fromTerm: e.target.value})}
                  >
                    <option value="1">เทอม 1</option>
                    <option value="2">เทอม 2</option>
                    <option value="3">Summer</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-center text-slate-400">
                ⬇️ คัดลอกไปยัง
              </div>

              {/* ปลายทาง */}
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <label className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2 block">ปลายทาง (Paste To)</label>
                <div className="flex gap-3">
                  <input 
                    type="text" placeholder="ปี" className="w-1/2 p-2 border border-indigo-200 rounded-lg text-center"
                    value={cloneConfig.toYear}
                    onChange={e => setCloneConfig({...cloneConfig, toYear: e.target.value})}
                  />
                  <select 
                    className="w-1/2 p-2 border border-indigo-200 rounded-lg text-center bg-white"
                    value={cloneConfig.toTerm}
                    onChange={e => setCloneConfig({...cloneConfig, toTerm: e.target.value})}
                  >
                    <option value="1">เทอม 1</option>
                    <option value="2">เทอม 2</option>
                    <option value="3">Summer</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ✅ ส่วนที่เติมให้ครบถ้วน */}
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button 
                onClick={() => setShowCloneModal(false)} 
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleCloneCourses} 
                className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-sm hover:shadow active:scale-95 transition"
              >
                ✅ ยืนยันการคัดลอก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}