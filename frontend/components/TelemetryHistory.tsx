'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readResource, acceptResult, type ResourceState } from '../lib/dashboard-sync';
import { formatSensor, formatTime, sampleStatus } from '../lib/dashboard';
import { METRICS, chartGeometry, parseSamples, selectWindow, summary, type Metric, type Sample } from '../lib/telemetry-history';

type DeviceChoice = { id: string; code: string; room_code: string; enabled: boolean };
const emptyRows: ResourceState<Sample[]> = { value: null, error: '', updatedAt: null };
export default function TelemetryHistory() {
  const [devices, setDevices] = useState<DeviceChoice[]>([]);
  const [device, setDevice] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const result = await readResource<unknown>('/api/backend/devices', controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) setError(result.error);
      else {
        const list = result.value;
        if (!Array.isArray(list) || !list.every(d => d && typeof d.id === 'string' && typeof d.code === 'string' && typeof d.room_code === 'string' && typeof d.enabled === 'boolean')) {
          setError('Danh sách thiết bị không hợp lệ.');
        } else {
          const active = (list as DeviceChoice[]).filter(d => d.enabled);
          setDevices(active); setError(''); setLoaded(true);
          setDevice(previous => active.some(d => d.id === previous) ? previous : active[0]?.id ?? '');
        }
      }
      timer = setTimeout(() => void poll(), 15_000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [retry]);
  return <>
    <div className="heading"><div><div className="eyebrow">SENSOR HISTORY</div><h1>Lịch sử cảm biến</h1><p>Xem diễn biến từ các mẫu đã được lưu, kể cả sau khi tải lại trang.</p></div></div>
    {error && <div className="alert" role="status">Không cập nhật được danh sách thiết bị: {error}. Trang sẽ tự thử lại. <button className="button" onClick={() => setRetry(n => n + 1)}>Thử lại</button></div>}
    <section className="panel"><label className="history-select">Phòng / thiết bị<select value={device} disabled={!devices.length} onChange={e => setDevice(e.target.value)}>
      {!devices.length && <option value="">{loaded ? 'Chưa có thiết bị đang bật' : 'Đang tải thiết bị…'}</option>}
      {devices.map(d => <option key={d.id} value={d.id}>{d.room_code} · {d.code}</option>)}
    </select></label><p className="history-note">Nguồn: tối đa 100 mẫu gần nhất của thiết bị được chọn, lưu tại PostgreSQL qua backend. Đây không phải toàn bộ lịch sử.</p></section>
    {device && <HistoryForDevice key={device} device={device} />}
  </>;
}
function HistoryForDevice({ device }: { device: string }) {
  const [resource, setResource] = useState<ResourceState<Sample[]>>(emptyRows);
  const [metric, setMetric] = useState<Metric>('temperature');
  const [minutes, setMinutes] = useState(0);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (!mounted.current || active.current) return;
    const controller = new AbortController(); active.current = controller; setLoading(true);
    try {
      const response = await readResource<unknown>(`/api/history?device_id=${encodeURIComponent(device)}`, controller.signal);
      if (!mounted.current || active.current !== controller || controller.signal.aborted) return;
      if (!response.ok) setResource(old => acceptResult(old, response, Date.now()));
      else {
        try { const rows = parseSamples(response.value, device); setResource(old => acceptResult(old, { ok: true, value: rows }, Date.now())); }
        catch (error) { setResource(old => ({ ...old, error: error instanceof Error ? error.message : 'Lịch sử không hợp lệ.' })); }
      }
    } finally {
      if (mounted.current && active.current === controller) { active.current = null; setLoading(false); }
    }
  }, [device]);
  useEffect(() => {
    mounted.current = true; setNow(Date.now());
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    async function poll() { await refresh(); if (!stopped) timer = setTimeout(() => void poll(), 5_000); }
    void poll();
    return () => { stopped = true; mounted.current = false; clearTimeout(timer); clearInterval(clock); active.current?.abort(); active.current = null; };
  }, [refresh]);
  const rows = resource.value ?? [];
  const selected = selectWindow(rows, minutes, now);
  const stats = summary(selected, metric);
  const chart = chartGeometry(selected, metric);
  const meta = METRICS.find(item => item.key === metric)!;
  const latest = rows[rows.length - 1];
  const freshness = sampleStatus(latest?.observed_at ?? null, now);
  return <section className="panel history-panel">
    <div className="history-toolbar">
      <label className="history-select">Thông số<select value={metric} onChange={e => setMetric(e.target.value as Metric)}>{METRICS.map(item => <option key={item.key} value={item.key}>{item.label} ({item.unit})</option>)}</select></label>
      <label className="history-select">Phạm vi trong 100 mẫu<select value={minutes} onChange={e => setMinutes(Number(e.target.value))}><option value={0}>Tất cả mẫu đã tải</option><option value={15}>15 phút gần đây</option><option value={60}>60 phút gần đây</option></select></label>
      <button className="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Đang tải…' : '↻ Làm mới lịch sử'}</button>
    </div>
    {resource.error && <div className="alert" role="status">Không cập nhật được lịch sử: {resource.error}. {resource.value ? 'Đang giữ dữ liệu từ lần đọc thành công gần nhất.' : 'Chưa tải được mẫu đo.'} Trang tự thử lại.</div>}
    <div className="history-status"><span className={`pill freshness-${freshness.kind}`}>{freshness.label}</span><p>Đọc thành công: {resource.updatedAt ? formatTime(new Date(resource.updatedAt).toISOString()) : 'Chưa có'} · Mẫu mới nhất: {formatTime(latest?.observed_at ?? null)}</p></div>
    <div className="history-stats">
      <div><small>MẪU CÓ GIÁ TRỊ</small><strong>{stats.count} / {selected.length}</strong></div>
      <div><small>THẤP NHẤT</small><strong>{formatSensor(stats.min, ` ${meta.unit}`)}</strong></div>
      <div><small>CAO NHẤT</small><strong>{formatSensor(stats.max, ` ${meta.unit}`)}</strong></div>
      <div><small>TRUNG BÌNH MẪU</small><strong>{formatSensor(stats.mean, ` ${meta.unit}`)}</strong></div>
    </div>
    {chart ? <svg className="history-chart" viewBox="0 0 760 245" role="img" aria-label={`${meta.label}: ${stats.count} mẫu hợp lệ. Chi tiết trong bảng bên dưới.`}>
      <title>{meta.label} ({meta.unit}) theo thời gian đo</title>
      {[0, .5, 1].map(t => <g key={t}><line x1="70" x2="710" y1={30 + t * 170} y2={30 + t * 170} stroke="#e3e9f2" /><text x="60" y={34 + t * 170} textAnchor="end">{formatSensor(chart.high - t * (chart.high - chart.low))}</text></g>)}
      {chart.segments.map((segment, index) => <g key={index}><polyline points={segment.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3e62e7" strokeWidth="2.5" />{segment.map(p => <circle key={p.row.id} cx={p.x} cy={p.y} r="3.5" fill="#3e62e7"><title>{formatTime(p.row.observed_at)}: {formatSensor(p.value, ` ${meta.unit}`)}</title></circle>)}</g>)}
      <text x="70" y="230">{new Date(chart.start).toLocaleTimeString('vi-VN')}</text><text x="710" y="230" textAnchor="end">{new Date(chart.end).toLocaleTimeString('vi-VN')}</text>
    </svg> : <div className="empty">{resource.value === null ? resource.error ? 'Chưa tải được lịch sử.' : 'Đang tải lịch sử…' : !selected.length ? 'Không có mẫu trong phạm vi này. Thử chọn “Tất cả mẫu đã tải” hoặc gửi dữ liệu từ simulator ở chế độ HTTP.' : 'Các mẫu trong phạm vi này chưa có giá trị hợp lệ cho thông số đã chọn.'}</div>}
    <p className="history-note">Trục ngang dùng thời điểm đo. Đường bị ngắt khi thiếu giá trị hoặc hai mẫu cách nhau hơn 60 giây. Giá trị thiếu không được đổi thành 0. Trung bình tính theo mẫu, không phải điện năng kWh.</p>
    {rows.some(row => row.time > now + 5_000) && <p className="alert">Có mẫu ở tương lai chưa được vẽ. Kiểm tra đồng hồ thiết bị và máy tính.</p>}
    <details className="history-table"><summary>Xem bảng dữ liệu ({selected.length} mẫu trong phạm vi)</summary><div className="table-scroll"><table><thead><tr><th>Thời điểm đo</th><th>{meta.label} ({meta.unit})</th><th>Nguồn</th></tr></thead><tbody>{selected.slice().reverse().map(row => <tr key={row.id}><td>{formatTime(row.observed_at)}</td><td>{formatSensor(row[metric])}</td><td>{row.simulated === true ? 'Giả lập' : row.simulated === false ? 'Thiết bị' : 'Chưa xác định'}</td></tr>)}</tbody></table></div></details>
  </section>;
}
