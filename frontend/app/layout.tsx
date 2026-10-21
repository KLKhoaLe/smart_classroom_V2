import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata:Metadata={title:'Classroom · Smart Automation',description:'Nền tảng quản lý lớp học thông minh'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="vi"><body><aside><Link href="/" className="brand"><b>C.</b><span>classroom<small>SMART AUTOMATION</small></span></Link><div className="navlabel">KHÔNG GIAN LÀM VIỆC</div><nav><Link href="/">◫ Tổng quan</Link><Link href="/history">↗ Lịch sử cảm biến</Link><Link href="/simulator">⇄ Phòng mô phỏng</Link><Link href="/incidents">◉ Sự cố</Link><Link href="/reports">▤ Báo cáo</Link></nav><div className="aside-bottom"><span className="pill">LOCAL FOUNDATION</span><p>n8n điều phối<br/>Thiết bị xác nhận<br/>Dữ liệu được lưu tại PostgreSQL</p></div></aside><div className="workspace"><header><span>Smart Classroom <i>/</i> Workspace</span><span className="avatar">KL</span></header><main>{children}</main><footer>Smart Classroom · Bản nền v0.1 <span>Nhóm 4 thành viên</span></footer></div></body></html>;
}
