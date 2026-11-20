'use client';

import { useDashboard } from './useDashboard';
import RoomReadings from './RoomReadings';
import { formatSensor, formatTime, type DashboardData, type DecisionWeather } from '../lib/dashboard';
import ManualControls from './ManualControls';

export default function Dashboard() {
  const { dashboard, commands: commandResource, loading, refresh } = useDashboard();
  const data = dashboard.value;
  const commands = commandResource.value ?? [];
  return <>
    <div className="heading">
      <div>
        <h1>Tổng quan vận hành</h1>
        <p>Dữ liệu cảm biến, điều khiển thiết bị và quyết định gần nhất.</p>
      </div>
      <div className="refresh-controls">
        <button onClick={() => void refresh()} disabled={loading} className="button">{loading ? 'Đang tải…' : '↻ Làm mới'}</button>
        <p>Cập nhật lúc {dashboard.updatedAt ? new Date(dashboard.updatedAt).toLocaleTimeString('vi-VN') : 'Chưa có'}</p>
      </div>
    </div>
    {dashboard.error && <div className="alert" role="status">
      Không cập nhật được dashboard ({dashboard.error}). {data ? 'Đang giữ dữ liệu từ lần đọc thành công gần nhất.' : 'Chưa tải được dữ liệu.'} Kiểm tra backend. Trang sẽ tự thử lại.
    </div>}
    <div className="stats">
      <div><small>PHÒNG CÓ THIẾT BỊ</small><strong>{data ? new Set(data.devices.map(device => device.room_code)).size : '—'}</strong></div>
      <div><small>BẢN TIN CẢM BIẾN</small><strong>{data?.stats.telemetry_count ?? '—'}</strong></div>
      <div><small>LỆNH ĐANG CHỜ</small><strong>{data?.stats.pending_commands ?? '—'}</strong></div>
      <div><small>SỰ CỐ CHƯA ĐÓNG</small><strong>{data?.stats.open_incidents ?? '—'}</strong></div>
    </div>
    {!data && !dashboard.error && <div className="panel empty">Đang tải dữ liệu…</div>}
    {data?.devices.length === 0 && <div className="panel empty">Chưa có thiết bị. Chạy npm run db:seed.</div>}
    {data?.devices.map(device => <section className="panel" key={device.id}>
      <div className="section-heading">
        <div><h2>Phòng {device.room_code}</h2><p>{device.code} · Heartbeat gần nhất: {formatTime(device.last_seen)}</p></div>
        <span className={'pill ' + (device.online ? 'green' : 'muted')}>{device.online ? 'Online ở lần đọc gần nhất' : 'Chưa online / Offline'}</span>
      </div>
      <RoomReadings device={device} />
      <AdaptiveSummary decision={data.decisions.find(item => item.device_code === device.code)} />
      <ManualControls levelsEnabled={data.manual_levels_enabled === true} commands={commands} device={device} enabled={data.manual_enabled} dashboardError={Boolean(dashboard.error || commandResource.error)} onSent={refresh} />
    </section>)}
    <div className="bottom-grid">
      <section className="panel">
        <h2>Lệnh gần đây</h2><p>Theo dõi từ yêu cầu đến kết quả thiết bị.</p>
        <p className="note">Cập nhật lúc {commandResource.updatedAt ? new Date(commandResource.updatedAt).toLocaleTimeString('vi-VN') : 'Chưa có'}</p>
        {commandResource.error && <div className="alert" role="status">
          Không cập nhật được danh sách lệnh ({commandResource.error}). {commandResource.value ? 'Đang giữ danh sách từ lần đọc thành công gần nhất.' : 'Chưa tải được danh sách.'} Trang sẽ tự thử lại.
        </div>}
        <div className="table-scroll"><table>
          <thead><tr><th>Thiết bị</th><th>Lệnh</th><th>Trạng thái</th></tr></thead>
          <tbody>{commands.slice(0, 8).map(command => <tr key={command.id}>
            <td>{command.device_code}</td><td>{command.command_type} · {command.action}{command.level != null ? ` · ${command.level}${command.command_type === 'LIGHT' ? '%' : '/3'}` : ''}</td>
            <td><span className={'pill ' + (command.status === 'ACK' ? 'green' : 'muted')}>{command.status}</span></td>
          </tr>)}</tbody>
        </table></div>
        {commandResource.value === null && !commandResource.error && <div className="empty">Đang tải danh sách lệnh…</div>}
        {commandResource.value !== null && !commands.length && <div className="empty">Chưa có lệnh.</div>}
      </section>
      <section className="panel">
        <h2>Quyết định gần đây</h2><p>Lý do và nguồn ra quyết định từ n8n.</p>
        {data?.decisions.map(decision => <div className="decision" key={decision.id}>
          <div className="decision-meta"><b>{decision.device_code}</b><small>{formatTime(decision.created_at)}</small><span className="pill">{decision.source}</span></div>
          <details><summary>Lý do quyết định</summary><p>{decision.reason}</p>
            <AdaptiveSummary decision={decision} />
          </details>
        </div>)}
        {data && !data.decisions.length && <div className="empty">Chưa có quyết định cho các mẫu cảm biến.</div>}
      </section>
    </div>
  </>;
}

function WeatherDecision({ weather }: { weather: DecisionWeather }) {
  if (weather.source === 'unavailable') return <p>Thiếu dữ liệu thời tiết · Dùng quy tắc trong phòng.</p>;
  const source = weather.source === 'open-meteo' ? 'Open-Meteo' : 'Thời tiết mô phỏng';
  const action = weather.strategy === 'ventilate' ? 'Thông gió giảm ẩm'
    : weather.strategy === 'dehumidify' ? 'Dùng máy hút ẩm' : 'Theo quy tắc trong phòng';
  return <div className="weather-decision">
    <b>{action}</b><p>Điểm sương trong phòng {formatSensor(weather.indoor_dew, ' °C')} · ngoài trời {formatSensor(weather.outdoor_dew, ' °C')}</p>
    <small>{source} · {formatTime(weather.observed_at)}</small>
  </div>;
}

function AdaptiveSummary({ decision }: { decision?: DashboardData['decisions'][number] }) {
  const evidence = decision?.evidence;
  if (!decision || (!evidence?.weather && !evidence?.actuator_levels)) return null;
  return <div className="adaptive-summary">
    <div><b>Điều khiển tự động</b>
      <p>Đề xuất lúc {formatTime(decision.created_at)}</p>
      {evidence.actuator_levels && <p>Quạt <strong>{evidence.actuator_levels.FAN ?? '—'}/3</strong>
        {' · '}Đèn <strong>{evidence.actuator_levels.LIGHT ?? '—'}%</strong></p>}
    </div>
    {evidence.weather && <WeatherDecision weather={evidence.weather} />}
  </div>;
}
