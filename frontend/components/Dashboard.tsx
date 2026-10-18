'use client';

import { useState } from 'react';
import { useDashboard } from './useDashboard';
import RoomReadings from './RoomReadings';
import { formatTime } from '../lib/dashboard';
import type { DeviceState, Device } from '../lib/dashboard';

const labels: Record<string, string> = {
  FAN: 'Quạt', LIGHT: 'Đèn chiếu sáng', VENTILATION: 'Thông gió', DEHUMIDIFIER: 'Máy hút ẩm',
};

export default function Dashboard() {
  const { dashboard, commands: commandResource, loading, refresh } = useDashboard();
  const data = dashboard.value;
  const commands = commandResource.value ?? [];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function manual(device: Device, state: DeviceState) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/backend/commands/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          device_id: device.id,
          command_type: state.command_type,
          action: state.desired_state === 'ON' ? 'OFF' : 'ON',
          override_minutes: 10,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message || body.error || 'Yêu cầu thất bại');
      setMessage('Đã gửi yêu cầu tới flow 03. Chờ command và ACK; chưa xác nhận thiết bị đổi trạng thái.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Yêu cầu thất bại');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="heading">
      <div>
        <div className="eyebrow">BUILD A BETTER CLASSROOM</div>
        <h1>Tổng quan hệ thống</h1>
        <p>Theo dõi môi trường, thiết bị và hành trình tự động hóa.</p>
      </div>
      <div className="refresh-controls">
        <button onClick={() => void refresh()} disabled={loading} className="button">{loading ? 'Đang tải…' : '↻ Làm mới'}</button>
        <p>Đọc dashboard thành công: {dashboard.updatedAt ? new Date(dashboard.updatedAt).toLocaleTimeString('vi-VN') : 'Chưa có'}</p>
      </div>
    </div>
    {dashboard.error && <div className="alert" role="status">
      Không cập nhật được dashboard ({dashboard.error}). {data ? 'Đang giữ dữ liệu từ lần đọc thành công gần nhất.' : 'Chưa tải được dữ liệu.'} Kiểm tra backend. Trang sẽ tự thử lại.
    </div>}
    <div className="stats">
      <div><small>PHÒNG CÓ THIẾT BỊ</small><strong>{data ? new Set(data.devices.map(device => device.room_code)).size : '—'}</strong><span>Nền demo A101</span></div>
      <div><small>BẢN TIN CẢM BIẾN</small><strong>{data?.stats.telemetry_count ?? '—'}</strong><span>Được lưu trong database</span></div>
      <div><small>LỆNH ĐANG CHỜ</small><strong>{data?.stats.pending_commands ?? '—'}</strong><span>PENDING / QUEUED / SENT</span></div>
      <div><small>SỰ CỐ CHƯA ĐÓNG</small><strong>{data?.stats.open_incidents ?? '—'}</strong><span>Module sự cố đang phát triển</span></div>
    </div>
    {!data && !dashboard.error && <div className="panel empty">Đang tải dữ liệu…</div>}
    {data?.devices.length === 0 && <div className="panel empty">Chưa có thiết bị. Chạy npm run db:seed.</div>}
    {data?.devices.map(device => <section className="panel" key={device.id}>
      <div className="section-heading">
        <div><h2>Phòng {device.room_code}</h2><p>{device.code} · Heartbeat gần nhất: {formatTime(device.last_seen)}</p></div>
        <span className={'pill ' + (device.online ? 'green' : 'muted')}>{device.online ? 'Online ở lần đọc gần nhất' : 'Chưa online / Offline'}</span>
      </div>
      <RoomReadings device={device} />
      <div className="device-grid">
        {device.states.map(state => <div className="device" key={state.command_type}>
          <div className="device-title">
            <b>{labels[state.command_type] || state.command_type}</b>
            <span className={'state ' + (state.actual_state === 'ON' ? 'on' : '')}>{state.actual_state ?? 'CHƯA XÁC NHẬN'}</span>
          </div>
          <p>Mong muốn: <strong>{state.desired_state}</strong></p>
          <p>Xác nhận: {state.confirmed_at ? formatTime(state.confirmed_at) : 'Chưa có ACK'}</p>
          <button disabled={busy || !data.manual_enabled} onClick={() => void manual(device, state)} className="button">Yêu cầu {state.desired_state === 'ON' ? 'tắt' : 'bật'}</button>
        </div>)}
      </div>
      {!data.manual_enabled && <p className="note">Điều khiển thủ công chưa bật: cần cấu hình webhook flow 03 ở backend. Dùng script smoke test để kiểm tra nền trước.</p>}
    </section>)}
    {message && <div className="alert" role="status">{message}</div>}
    <div className="bottom-grid">
      <section className="panel">
        <h2>Lệnh gần đây</h2><p>Theo dõi từ yêu cầu đến kết quả thiết bị.</p>
        <p className="note">Đọc danh sách lệnh thành công: {commandResource.updatedAt ? new Date(commandResource.updatedAt).toLocaleTimeString('vi-VN') : 'Chưa có'}</p>
        {commandResource.error && <div className="alert" role="status">
          Không cập nhật được danh sách lệnh ({commandResource.error}). {commandResource.value ? 'Đang giữ danh sách từ lần đọc thành công gần nhất.' : 'Chưa tải được danh sách.'} Trang sẽ tự thử lại.
        </div>}
        <div className="table-scroll"><table>
          <thead><tr><th>Thiết bị</th><th>Lệnh</th><th>Trạng thái</th></tr></thead>
          <tbody>{commands.slice(0, 8).map(command => <tr key={command.id}>
            <td>{command.device_code}</td><td>{command.command_type} · {command.action}</td>
            <td><span className={'pill ' + (command.status === 'ACK' ? 'green' : 'muted')}>{command.status}</span></td>
          </tr>)}</tbody>
        </table></div>
        {commandResource.value === null && !commandResource.error && <div className="empty">Đang tải danh sách lệnh…</div>}
        {commandResource.value !== null && !commands.length && <div className="empty">Chưa có lệnh.</div>}
      </section>
      <section className="panel">
        <h2>Quyết định gần đây</h2><p>Lý do và nguồn ra quyết định từ n8n.</p>
        {data?.decisions.map(decision => <div className="decision" key={decision.id}>
          <span className="pill">{decision.source}</span><p>{decision.reason}</p><small>{formatTime(decision.created_at)}</small>
        </div>)}
        {data && !data.decisions.length && <div className="empty">Chưa có quyết định AI/rule.<br />Bản nền không tự tạo nhận xét giả.</div>}
      </section>
    </div>
  </>;
}
