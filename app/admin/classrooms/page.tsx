'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ManageClassrooms() {
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  // ตั้งค่าเริ่มต้นเป็น "ม.ปลาย" เสมอ
  const [formData, setFormData] = useState({
    name: '',
    level: 'ม.ปลาย' 
  })

  useEffect(() => {
    fetchClassrooms()
  }, [])

  async function fetchClassrooms() {
    // ดึงเฉพาะข้อมูลที่เป็น "ม.ปลาย" มาแสดง
    const { data } = await supabase
      .from('classrooms')
      .select('*')
      .eq('level', 'ม.ปลาย') // <--- กรองตรงนี้
      .order('name', { ascending: true })

    if (data) setClassrooms(data)
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.name) return alert('กรุณากรอกชื่อห้องเรียน')

    // ข้อมูลที่จะบันทึก (บังคับเป็น ม.ปลาย)
    const dataToSave = {
        name: formData.name,
        level: 'ม.ปลาย'
    }

    if (editingId) {
      // แก้ไข
      const { error } = await supabase
        .from('classrooms')
        .update(dataToSave)
        .eq('id', editingId)
      if (!error) alert('✅ แก้ไขเรียบร้อย')
    } else {
      // เพิ่มใหม่
      const { error } = await supabase
        .from('classrooms')
        .insert([dataToSave])
      if (!error) alert('✅ เพิ่มห้องเรียนสำเร็จ')
    }

    // รีเซ็ตค่า
    setEditingId(null)
    setFormData({ name: '', level: 'ม.ปลาย' })
    fetchClassrooms()
  }

  async function handleDelete(id: number) {
    if (!confirm('ยืนยันที่จะลบห้องเรียนนี้?')) return
    const { error } = await supabase.from('classrooms').delete().eq('id', id)
    if (!error) fetchClassrooms()
  }

  function startEdit(room: any) {
    setEditingId(room.id)
    setFormData({ name: room.name, level: 'ม.ปลาย' })
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">🏫 จัดการห้องเรียน (ม.ปลาย)</h1>
          <Link href="/admin" className="text-blue-600 hover:underline">← กลับ Dashboard</Link>
        </div>

        {/* ฟอร์มเพิ่มห้องเรียน (เหลือแค่ช่องกรอกชื่อห้อง) */}
        <div className={`p-6 rounded-lg shadow mb-8 ${editingId ? 'bg-orange-50 border border-orange-200' : 'bg-white'}`}>
          <h2 className="text-lg font-bold mb-4 text-slate-700">
            {editingId ? '✏️ แก้ไขชื่อห้อง' : '➕ เพิ่มห้องเรียน ม.ปลาย'}
          </h2>
          <form onSubmit={handleSave} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">ชื่อห้อง (เช่น 4/1, 5/2, 6/3)</label>
              <input 
                type="text" 
                placeholder="ระบุห้อง เช่น 4/1" 
                className="w-full border p-2 rounded text-lg"
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            {/* ปุ่มบันทึก */}
            <button type="submit" className={`p-2 rounded text-white px-6 text-lg ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-600 hover:bg-purple-700'}`}>
              {editingId ? 'บันทึกแก้' : 'เพิ่มห้อง'}
            </button>
            
            {editingId && (
              <button type="button" onClick={() => {setEditingId(null); setFormData({name:'', level:'ม.ปลาย'})}} className="p-2 rounded bg-gray-300 hover:bg-gray-400">
                ยกเลิก
              </button>
            )}
          </form>
        </div>

        {/* ตารางแสดงผล */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-200">
              <tr>
                <th className="p-3 pl-6">ชื่อห้องเรียน</th>
                <th className="p-3 text-center">สถานะ</th>
                <th className="p-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={3} className="p-4 text-center">กำลังโหลด...</td></tr> : classrooms.map(r => (
                <tr key={r.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 pl-6 font-bold text-lg text-slate-700">{r.name}</td>
                  <td className="p-3 text-center">
                    <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold">
                        ม.ปลาย
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => startEdit(r)} className="text-orange-600 mr-4 hover:underline font-medium">แก้ไข</button>
                    <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline font-medium">ลบ</button>
                  </td>
                </tr>
              ))}
              {classrooms.length === 0 && !loading && (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-400">ยังไม่มีข้อมูลห้องเรียน ม.ปลาย</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}