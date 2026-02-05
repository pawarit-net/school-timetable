'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ManageTeachers() {
  const [teachers, setTeachers] = useState<any[]>([])
  
  // Form States
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  
  // Edit State
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => { fetchTeachers() }, [])

  async function fetchTeachers() {
    const { data } = await supabase.from('teachers').select('*').order('id')
    setTeachers(data || [])
  }

  async function handleSubmit() {
    if (!fullName) return alert('กรุณาใส่ชื่อ-นามสกุล')
    
    const payload = { full_name: fullName, nickname }

    if (editId) {
      // --- โหมดแก้ไข ---
      const { error } = await supabase.from('teachers').update(payload).eq('id', editId)
      if (error) alert(error.message)
      else {
        cancelEdit()
        fetchTeachers()
      }
    } else {
      // --- โหมดเพิ่มใหม่ ---
      const { error } = await supabase.from('teachers').insert([payload])
      if (error) alert(error.message)
      else {
        cancelEdit()
        fetchTeachers()
      }
    }
  }

  function startEdit(t: any) {
    setEditId(t.id)
    setFullName(t.full_name)
    setNickname(t.nickname || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditId(null)
    setFullName('')
    setNickname('')
  }

  async function handleDelete(id: number) {
    if (!confirm('ยืนยันลบ? (วิชาและตารางสอนของครูคนนี้จะหายไปด้วย)')) return
    await supabase.from('teachers').delete().eq('id', id)
    fetchTeachers()
  }

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans bg-slate-50 min-h-screen">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">👨‍🏫 จัดการรายชื่อครู</h1>
          <p className="text-slate-500 text-sm">เพิ่ม/ลบ/แก้ไข ข้อมูลคุณครูในโรงเรียน</p>
        </div>
        <Link 
          href="/admin" 
          className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg shadow transition-colors flex items-center gap-2"
        >
          ⬅️ ย้อนกลับ
        </Link>
      </div>

      {/* Form Area */}
      <div className={`p-6 rounded-lg shadow-sm border mb-6 flex gap-4 items-end transition-colors ${editId ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200'}`}>
        
        {editId && <div className="w-full text-sm text-yellow-700 font-bold mb-[-10px]">⚠️ กำลังแก้ไขข้อมูล: {fullName}</div>}

        <div className="flex-1">
          <label className="text-sm font-bold text-slate-700 mb-1 block">ชื่อ-นามสกุล (จริง)</label>
          <input className="border border-slate-300 p-2 rounded w-full" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="เช่น นายสมชาย ใจดี" />
        </div>
        <div className="w-40">
          <label className="text-sm font-bold text-slate-700 mb-1 block">ชื่อเล่น</label>
          <input className="border border-slate-300 p-2 rounded w-full" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="ครูเอ" />
        </div>
        
        <div className="flex gap-2">
            <button onClick={handleSubmit} className={`text-white px-6 py-2 rounded font-bold h-[42px] transition-colors ${editId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'}`}>
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
              <th className="p-4 font-bold text-slate-700">ID</th>
              <th className="p-4 font-bold text-slate-700">ชื่อ-นามสกุล</th>
              <th className="p-4 font-bold text-slate-700">ชื่อเล่น</th>
              <th className="p-4 text-right font-bold text-slate-700 w-48">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className={`border-b transition-colors ${editId === t.id ? 'bg-yellow-50' : 'hover:bg-slate-50'}`}>
                <td className="p-4 text-gray-500">{t.id}</td>
                <td className="p-4 font-medium text-slate-800">{t.full_name}</td>
                <td className="p-4 text-slate-600">{t.nickname}</td>
                <td className="p-4 text-right flex justify-end gap-2">
                  <button 
                    onClick={() => startEdit(t)} 
                    className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 px-3 py-1 rounded font-bold transition-colors"
                  >
                    แก้ไข
                  </button>
                  <button 
                    onClick={() => handleDelete(t.id)} 
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded font-bold transition-colors"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-gray-400">ยังไม่มีรายชื่อครู</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}