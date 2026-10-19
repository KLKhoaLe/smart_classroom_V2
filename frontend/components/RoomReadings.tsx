'use client';

import { useEffect, useState } from 'react';
import { Device, formatSensor, formatTime, sampleStatus } from '../lib/dashboard';

export default function RoomReadings({ device }: { device: Device }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const status = now === null
    ? { kind: 'missing', label: 'Đang kiểm tra thời gian mẫu…' }
    : sampleStatus(device.observed_at, now);
  const readings = [
    ['Nhiệt độ', formatSensor(device.temperature, ' °C')],
    ['Độ ẩm', formatSensor(device.humidity, ' %')],
    ['CO₂', formatSensor(device.co2_ppm, ' ppm')],
    ['Số người', formatSensor(device.occupancy_count)],
    ['Độ sáng', formatSensor(device.light_percent, ' %')],
    ['Công suất', formatSensor(device.power_w, ' W')],
  ];

  return <div className="room-readings">
    <div className="readings-summary">
      <span className={`pill freshness-${status.kind}`} role="status">{status.label}</span>
      <p>Mẫu đo: <time dateTime={device.observed_at || undefined}>{formatTime(device.observed_at)}</time></p>
    </div>
    <div className="metrics">
      {readings.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </div>
    {(status.kind === 'stale' || status.kind === 'invalid') && <p className="readings-note">
      Các số trên là mẫu đã nhận gần nhất. Chờ mẫu đo hợp lệ tiếp theo để xác nhận dữ liệu hiện tại.
    </p>}
    {status.kind === 'missing' && now !== null && <p className="readings-note">
      Chưa có telemetry cho thiết bị này. Bật simulator ở chế độ HTTP và bấm Bắt đầu.
    </p>}
  </div>;
}
