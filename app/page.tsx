import { createClient } from '@supabase/supabase-js'

// 1. ตั้งค่าการเชื่อมต่อ (ดึงกุญแจจากไฟล์ .env.local ที่เราทำไว้)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// 2. ฟังก์ชันหลักของหน้านี้
export default async function Home() {
  
  // 3. สั่งดึงข้อมูลจากตาราง 'teachers'
  const { data: teachers, error } = await supabase
    .from('teachers')
    .select('*')
    .order('id', { ascending: true })

  // ถ้ามี error ให้แสดงออกมา
  if (error) {
    return <div className="p-10 text-red-500">Error: {error.message}</div>
  }

  // 4. ส่วนแสดงผลบนหน้าเว็บ (HTML)
  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        🏫 รายชื่อครูในระบบ (เชื่อมต่อ Database สำเร็จ!)
      </h1>

      <table border={1} cellPadding={10} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th>ID</th>
            <th>ชื่อ-นามสกุล</th>
            <th>ชื่อเล่น</th>
            <th>ตำแหน่ง</th>
            <th>สีประจำตัว</th>
          </tr>
        </thead>
        <tbody>
          {teachers?.map((teacher) => (
            <tr key={teacher.id}>
              <td>{teacher.id}</td>
              <td>{teacher.full_name}</td>
              <td>{teacher.nickname}</td>
              <td>{teacher.position}</td>
              <td>
                <span style={{ 
                  display: 'inline-block', 
                  width: '20px', 
                  height: '20px', 
                  backgroundColor: teacher.color_code,
                  borderRadius: '50%'
                }}></span> {teacher.color_code}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}