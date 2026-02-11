'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'



export default function ManageSubjects() {
  const [subjects, setSubjects] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  
  // Form States
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [teacherId, setTeacherId] = useState('')
  
  // State สำหรับโหมดแก้ไข (เก็บ ID ของวิชาที่กำลังแก้)
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: s } = await supabase.from('subjects').select('*, teachers(full_name, nickname)').order('code')
    const { data: t } = await supabase.from('teachers').select('*').order('full_name')
    setSubjects(s || [])
    setTeachers(t || [])
  }

  async function handleSubmit() {
    if (!code || !name) return alert('กรอกรหัสและชื่อวิชาให้ครบ')
    
    const payload: any = { code, name }
    // แปลง teacherId เป็น number หรือ null ถ้าเป็นค่าว่าง
    payload.teacher_id = teacherId ? parseInt(teacherId) : null

    if (editId) {
      // --- โหมดแก้ไข (Update) ---
      const { error } = await supabase.from('subjects').update(payload).eq('id', editId)
      if (error) alert(error.message)
      else {
        cancelEdit() // รีเซ็ตฟอร์ม
        fetchData()
      }
    } else {
      // --- โหมดเพิ่มใหม่ (Insert) ---
      const { error } = await supabase.from('subjects').insert([payload])
      if (error) alert(error.message)
      else {
        cancelEdit() // รีเซ็ตฟอร์ม
        fetchData()
      }
    }
  }

  // ฟังก์ชันเริ่มแก้ไข (ดึงข้อมูลมาใส่ฟอร์ม)
  function startEdit(s: any) {
    setEditId(s.id)
    setCode(s.code)
    setName(s.name)
    setTeacherId(s.teacher_id ? s.teacher_id.toString() : '')
    // เลื่อนหน้าจอขึ้นไปที่ฟอร์ม (UX)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ฟังก์ชันยกเลิกแก้ไข
  function cancelEdit() {
    setEditId(null)
    setCode('')
    setName('')
    setTeacherId('')
  }

  async function handleDelete(id: number) {
    if (!confirm('ยืนยันลบวิชานี้?')) return
    await supabase.from('subjects').delete().eq('id', id)
    fetchData()
  }

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans bg-slate-50 min-h-screen">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📚 จัดการรายวิชา</h1>
          <p className="text-slate-500 text-sm">เพิ่ม/ลบ/แก้ไข ข้อมูลวิชาเรียน</p>
        </div>
        <Link 
          href="/admin" 
          className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg shadow transition-colors flex items-center gap-2"
        >
          ⬅️ ย้อนกลับ
        </Link>
      </div>

      {/* Form Area */}
      <div className={`p-6 rounded-lg shadow-sm border mb-6 flex gap-4 items-end flex-wrap transition-colors ${editId ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200'}`}>
        
        {/* แสดงข้อความว่ากำลังแก้ไข */}
        {editId && <div className="w-full text-sm text-yellow-700 font-bold mb-[-10px]">⚠️ กำลังแก้ไขข้อมูลวิชา: {code}</div>}

        <div className="w-32">
          <label className="text-sm font-bold text-slate-700 mb-1 block">รหัสวิชา</label>
          <input className="border border-slate-300 p-2 rounded w-full" value={code} onChange={e => setCode(e.target.value)} placeholder="ว21101" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-bold text-slate-700 mb-1 block">ชื่อวิชา</label>
          <input className="border border-slate-300 p-2 rounded w-full" value={name} onChange={e => setName(e.target.value)} placeholder="วิทยาศาสตร์พื้นฐาน" />
        </div>
        <div className="w-56">
          <label className="text-sm font-bold text-slate-700 mb-1 block">ครูผู้สอนหลัก</label>
          <select className="border border-slate-300 p-2 rounded w-full" value={teacherId} onChange={e => setTeacherId(e.target.value)}>
            <option value="">-- ไม่ระบุ --</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.nickname})</option>)}
          </select>
        </div>

        {/* ปุ่ม Action (เปลี่ยนตามสถานะ) */}
        <div className="flex gap-2">
            <button 
                onClick={handleSubmit} 
                className={`text-white px-6 py-2 rounded font-bold h-[42px] transition-colors ${editId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'}`}
            >
                {editId ? 'บันทึกแก้ไข' : '+ เพิ่ม'}
            </button>
            
            {editId && (
                <button onClick={cancelEdit} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded font-bold h-[42px]">
                    ยกเลิก
                </button>
            )}
        </div>
      </div>

      {/* Table Area */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-slate-200">
        <table className="w-full text-left">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="p-4 font-bold text-slate-700">รหัส</th>
              <th className="p-4 font-bold text-slate-700">ชื่อวิชา</th>
              <th className="p-4 font-bold text-slate-700">ครูผู้สอน</th>
              <th className="p-4 text-right font-bold text-slate-700 w-48">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className={`border-b transition-colors ${editId === s.id ? 'bg-yellow-50' : 'hover:bg-slate-50'}`}>
                <td className="p-4 font-bold text-blue-700">{s.code}</td>
                <td className="p-4 font-medium text-slate-800">{s.name}</td>
                <td className="p-4 text-sm text-slate-600">
                  {s.teachers ? (
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                      ครู{s.teachers.nickname || ''} ({s.teachers.full_name})
                    </span>
                  ) : '-'}
                </td>
                <td className="p-4 text-right flex justify-end gap-2">
                  <button 
                    onClick={() => startEdit(s)} 
                    className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 px-3 py-1 rounded font-bold transition-colors"
                  >
                    แก้ไข
                  </button>
                  <button 
                    onClick={() => handleDelete(s.id)} 
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded font-bold transition-colors"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-gray-400">ยังไม่มีรายวิชา</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}