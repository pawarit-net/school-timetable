import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-8">🏫 ระบบบริหารจัดการตารางเรียน</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* การ์ด 1: จัดตาราง (พระเอกของเรา) */}
          <Link href="/admin/timetable" className="block group">
            <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition-all border-l-8 border-blue-500 h-full flex flex-col justify-center items-center text-center">
              <div className="text-6xl mb-4">🗓️</div>
              <h2 className="text-2xl font-bold text-gray-800 group-hover:text-blue-600">จัดตารางสอน</h2>
              <p className="text-gray-500 mt-2">ลงคาบเรียน เลือกห้อง เลือกครู</p>
            </div>
          </Link>

          {/* การ์ด 2: จัดการวิชา */}
          <Link href="/admin/subjects" className="block group">
            <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition-all border-l-8 border-orange-500 h-full flex flex-col justify-center items-center text-center">
              <div className="text-6xl mb-4">📚</div>
              <h2 className="text-2xl font-bold text-gray-800 group-hover:text-orange-600">ข้อมูลวิชา</h2>
              <p className="text-gray-500 mt-2">เพิ่ม/ลบ รายวิชาและครูประจำวิชา</p>
            </div>
          </Link>

          {/* การ์ด 3: จัดการครู */}
          <Link href="/admin/manage-teachers" className="block group">
            <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition-all border-l-8 border-green-500 h-full flex flex-col justify-center items-center text-center">
              <div className="text-6xl mb-4">👨‍🏫</div>
              <h2 className="text-2xl font-bold text-gray-800 group-hover:text-green-600">ข้อมูลครู</h2>
              <p className="text-gray-500 mt-2">จัดการรายชื่อครูในโรงเรียน</p>
            </div>
          </Link>

        </div>
      </div>
    </div>
  )
}