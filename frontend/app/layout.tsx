import type { Metadata } from 'next';
import Link from 'next/link';
import RoomNavigation from '../components/RoomNavigation';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Classroom · Vận hành phòng',
  description: 'Giám sát cảm biến và điều khiển thiết bị trong phòng.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>
    <aside>
      <Link href="/" className="brand"><b aria-hidden="true">SC</b><span>Smart Classroom</span></Link>
      <RoomNavigation />
    </aside>
    <div className="workspace"><main>{children}</main></div>
  </body></html>;
}
