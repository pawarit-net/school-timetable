'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = await createClient()

import Link from 'next/link'

// 1. สร้าง Client Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์']

// 2. กำหนด Type ให้ชัดเจน เพื่อแก้ปัญหา TypeScript
type TimelineItem = {
  type: 'period' | 'break';
  id?: number; // id เป็น optional เพราะ 'break' ไม่มี id
  time: string;
  label?: string;
}

const TIMELINE: TimelineItem[] = [
  { type: 'period', id: 1, time: '08:30-09:20' },
  { type: 'period', id: 2, time: '09:20-10:10' },
  { type: 'break',  label: 'พัก', time: '10:10-10:25' },
  { type: 'period', id: 3, time: '10:25-11:15' },
  { type: 'period', id: 4, time: '11:15-12:05' },
  { type: 'break',  label: 'พักเที่ยง', time: '12:05-13:00' },
  { type: 'period', id: 5, time: '13:00-13:50' },
  { type: 'break',  label: 'พัก', time: '13:50-14:00' },
  { type: 'period', id: 6, time: '14:00-14:50' },
  { type: 'period', id: 7, time: '14:50-15:40' },
]

export default function TimetableScheduler() {
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  
  const [selectedClassroom, setSelectedClassroom] = useState<string>('')
  const [schedules, setSchedules] = useState<any[]>([]) 
  
  const [showModal, setShowModal] = useState(false)
  const [targetSlot, setTargetSlot] = useState<{day: string, period: number} | null>(null)
  
  const [formSubject, setFormSubject] = useState('')
  const [formTeacher, setFormTeacher] = useState('')

  useEffect(() => {
    async function initData() {
      const { data: roomData } = await supabase.from('classrooms').select('*').order('name')
      const { data: subjData } = await supabase.from('subjects').select('*').order('code')
      const { data: teachData } = await supabase.from('teachers').select('*')

      if (roomData && roomData.length > 0) {
        setClassrooms(roomData)
        setSelectedClassroom(roomData[0].id.toString())
      }
      if (subjData) setSubjects(subjData)
      if (teachData) setTeachers(teachData)
    }
    initData()
  }, [])

  useEffect(() => {
    if (selectedClassroom) fetchSchedules()
  }, [selectedClassroom])

  async function fetchSchedules() {
    const { data, error } = await supabase
      .from('schedules')
      .select(`
        id, day, period,
        subjects (code, name),
        teachers (full_name, nickname) 
      `)
      .eq('classroom_id', selectedClassroom)
    
    if (error) {
      console.error("❌ Error:", error)
      alert("โหลดตารางไม่ได้: " + error.message)
    } else {
      setSchedules(data || [])
    }
  }

  function openAddModal(day: string, period: number) {
    setTargetSlot({ day, period })
    setFormSubject('')
    setFormTeacher('')
    setShowModal(true)
  }

  function handleSubjectChange(subjectId: string) {
    setFormSubject(subjectId)
    const selectedSubj = subjects.find(s => s.id.toString() === subjectId)
    if (selectedSubj && selectedSubj.teacher_id) {
      setFormTeacher(selectedSubj.teacher_id.toString())
    }
  }

  async function handleSave() {
    if (!formSubject || !formTeacher || !targetSlot) return alert('กรุณาเลือกข้อมูลให้ครบ')

    const { error } = await supabase.from('schedules').insert([{
      classroom_id: parseInt(selectedClassroom),
      subject_id: parseInt(formSubject),
      teacher_id: parseInt(formTeacher),
      day: targetSlot.day,
      period: targetSlot.period
    }])

    if (error) {
      if (error.message.includes('unique')) {
         alert('❌ ไม่สามารถบันทึกได้: ครูสอนซ้อน หรือห้องนี้มีเรียนแล้ว')
      } else {
         alert('Error: ' + error.message)
      }
    } else {
      setShowModal(false)
      fetchSchedules()
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('ลบคาบเรียนนี้?')) return
    await supabase.from('schedules').delete().eq('id', id)
    fetchSchedules()
  }

  function getSlotData(day: string, period: number) {
    return schedules.find(s => s.day === day && s.period === period)
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans relative">
      
      {/* --- Header --- */}
      <div className="max-w-[1400px] mx-auto bg-white p-4 rounded-lg shadow-md mb-6 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link 
            href="/admin" 
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-md font-bold transition-colors flex items-center text-sm"
          >
            ⬅️ กลับ
          </Link>
          <h1 className="text-xl font-bold text-slate-800">🗓️ จัดตารางสอน</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-bold hidden sm:inline">เลือกห้อง:</span>
          <select 
            className="border-2 border-blue-500 p-2 rounded-md font-bold text-blue-700 min-w-[150px]"
            value={selectedClassroom}
            onChange={(e) => setSelectedClassroom(e.target.value)}
          >
            {classrooms.map(c => <option key={c.id} value={c.id}>ห้อง {c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto bg-white rounded-lg shadow overflow-x-auto pb-8">
        <table className="w-full border-collapse text-center table-fixed">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-2 w-24 sticky left-0 z-10 bg-slate-800">วัน</th>
              {TIMELINE.map((slot, index) => (
                <th key={index} className={`p-2 border-l border-slate-600 ${slot.type === 'break' ? 'w-[60px] bg-slate-700' : 'w-[140px]'}`}>
                  {slot.type === 'period' ? `คาบที่ ${slot.id}` : slot.label}
                  {slot.type === 'period' && <div className="text-xs font-light opacity-70">{slot.time}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day} className="border-b">
                <td className="p-4 font-bold bg-slate-100 sticky left-0 z-10">{day}</td>
                {TIMELINE.map((slot, index) => {
                  // FIX: เช็คให้แน่ใจว่าถ้าเป็น break หรือไม่มี id ให้แสดงช่องว่าง
                  if (slot.type === 'break' || !slot.id) {
                    return <td key={index} className="bg-slate-200"></td>
                  }
                  
                  // ดึงข้อมูลโดยใช้ ID ที่มั่นใจว่ามีค่าแล้ว
                  const data = getSlotData(day, slot.id!)

                  return (
                    <td key={index} className="p-1 border-l relative h-32 align-top">
                      {data ? (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 h-full text-left relative group">
                          <button onClick={() => handleDelete(data.id)} className="absolute top-1 right-1 text-red-400 opacity-0 group-hover:opacity-100 font-bold">×</button>
                          {/* ใช้ ?. เพื่อป้องกัน error ถ้า data มาไม่ครบ */}
                          <div className="font-bold text-blue-800 text-sm">{data.subjects?.code}</div>
                          <div className="text-xs text-slate-600 mb-1 line-clamp-2">{data.subjects?.name}</div>
                          <div className="text-xs text-slate-500 bg-white inline-block px-1 rounded border max-w-full truncate">
                             ครู{data.teachers?.full_name}
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => openAddModal(day, slot.id!)} className="w-full h-full text-transparent hover:text-gray-400 hover:bg-gray-50 text-2xl">+</button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h2 className="text-xl font-bold mb-4">ลงวิชาเรียน</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600">วิชา</label>
                <select className="w-full border p-2 rounded" value={formSubject} onChange={e => handleSubjectChange(e.target.value)}>
                  <option value="">-- เลือกวิชา --</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600">ครูผู้สอน</label>
                <select className="w-full border p-2 rounded" value={formTeacher} onChange={e => setFormTeacher(e.target.value)}>
                  <option value="">-- เลือกครู --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.nickname})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={handleSave} className="flex-1 bg-green-600 text-white p-2 rounded">บันทึก</button>
              <button onClick={() => setShowModal(false)} className="flex-1 bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}