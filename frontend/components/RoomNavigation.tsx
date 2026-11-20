'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const routes = [
  ['/', 'Tổng quan'], ['/history', 'Lịch sử cảm biến'], ['/simulator', 'Phòng mô phỏng'],
  ['/incidents', 'Sự cố'], ['/reports', 'Báo cáo'],
];

export default function RoomNavigation() {
  const path = usePathname();
  return <nav aria-label="Điều hướng chính">{routes.map(([href, label]) =>
    <Link key={href} href={href} aria-current={href === path ? 'page' : undefined}>{label}</Link>
  )}</nav>;
}
