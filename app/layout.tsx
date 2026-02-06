import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar"; // 👈 เพิ่มการดึง Navbar มาใช้

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ระบบจัดการโรงเรียน", // เปลี่ยนชื่อให้เข้ากับแอปเราหน่อย
  description: "ระบบจัดการตารางสอนและรายวิชา",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Navbar /> {/* แถบเมนูของคุณ */}
        <main className="pt-20"> {/* เพิ่ม pt-20 เพื่อดันเนื้อหาลงมาไม่ให้โดนเมนูบัง */}
          {children}
        </main>
      </body>
    </html>
  );
}