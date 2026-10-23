'use client';

import { useEffect, useRef, useState } from 'react';
import { Device, Command, formatTime } from '../lib/dashboard';
import { releaseManualOverride, ManualOverride, countdown, HOLD_MINUTES, manualPayload, overrideMode, sendManualRequest } from '../lib/manual-control';
import { useManualOverrides } from './useManualOverrides';

const labels: Record<string, string> = {
  FAN: 'Quạt', LIGHT: 'Đèn chiếu sáng', VENTILATION: 'Thông gió', DEHUMIDIFIER: 'Máy hút ẩm',
};

export default function ManualControls({ device, enabled, dashboardError, onSent, levelsEnabled = false, commands = [] }: {
  device: Device; levelsEnabled?: boolean; commands?: Command[]; enabled: boolean; dashboardError: boolean; onSent: () => Promise<void>;
}) {
  const overrides = useManualOverrides(device.id);
  const [minutes, setMinutes] = useState(10);
  const [levels, setLevels] = useState<Record<string,number>>({FAN:2,LIGHT:70});
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const activePost = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; clearInterval(timer); activePost.current?.abort(); activePost.current = null; };
  }, []);

  const verified = overrides.value !== null && !overrides.error && !dashboardError && now > 0;
  const disabled = busy || !enabled || !device.online || !verified;

  async function submit(commandType: string, action: 'ON' | 'OFF') {
    if (disabled || activePost.current) return;
    const controller = new AbortController();
    activePost.current = controller;
    setBusy(true);
    setMessage('');
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      await sendManualRequest(manualPayload(device.id, commandType, action, minutes, ['FAN','LIGHT'].includes(commandType) ? (action === 'OFF' ? 0 : levels[commandType]) : undefined), controller.signal);
      clearTimeout(timer);
      if (mounted.current && activePost.current === controller) {
        setMessage(`${labels[commandType] || commandType}: webhook đã nhận yêu cầu ${action === 'ON' ? 'bật' : 'tắt'}, ${['FAN','LIGHT'].includes(commandType) ? `mức ${action === 'OFF' ? 0 : levels[commandType]}${commandType === 'LIGHT' ? '%' : '/3'}, ` : ''}thời gian giữ ${minutes} phút. Chờ xác nhận chế độ và ACK; chưa xác nhận thiết bị thực hiện.`);
        // Chỉ đọc lại server; không tự sửa actual_state hay tự tạo bộ đếm override.
        await Promise.all([overrides.refresh(), onSent()]);
      }
    } catch (error) {
      if (mounted.current && activePost.current === controller) setMessage(controller.signal.aborted
        ? 'Hết thời gian chờ. Chưa xác định yêu cầu đã được xử lý hay chưa. Kiểm tra trạng thái và lịch sử lệnh trước khi gửi lại.'
        : `${error instanceof Error ? error.message : 'Lỗi kết nối.'} Kiểm tra trạng thái và lịch sử lệnh trước khi gửi lại.`);
    } finally {
      clearTimeout(timer);
      if (mounted.current && activePost.current === controller) { activePost.current = null; setBusy(false); }
    }
  }

  async function release(override: ManualOverride) {
    if (busy || !verified || activePost.current) return;
    const controller = new AbortController(); activePost.current = controller;
    setBusy(true); setMessage('');
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await releaseManualOverride(device.id, override, controller.signal);
      if (mounted.current) {
        setMessage(`${labels[override.command_type]}: đã bỏ giữ thủ công. AUTO được phép ở lượt xử lý tiếp theo. ${result.awaiting_ack ? 'Lệnh đã gửi vẫn đang chờ ACK; không thể thu hồi từ thiết bị.' : 'Đã hủy lệnh thủ công chưa gửi, nếu có.'} Trạng thái thực tế không tự đổi.`);
        await Promise.all([overrides.refresh(), onSent()]);
      }
    } catch (error) {
      if (mounted.current) setMessage(controller.signal.aborted ? 'Chưa xác định kết quả trả về AUTO. Chờ đọc lại chế độ trước khi thử lại.' : error instanceof Error ? error.message : 'Lỗi kết nối.');
    } finally {
      clearTimeout(timer);
      if (mounted.current && activePost.current === controller) { activePost.current = null; setBusy(false); }
    }
  }

  return <div className="manual-controls">
    <div className="manual-toolbar">
      <div><h3>Điều khiển thủ công</h3><p>Chọn mức và thời gian giữ cho yêu cầu tiếp theo. Mức đang chọn chưa phải trạng thái thực tế.</p></div>
      <label>Thời gian giữ
        <select aria-label={`Thời gian giữ phòng ${device.room_code} thiết bị ${device.code}`} value={minutes} onChange={event => setMinutes(Number(event.target.value))} disabled={busy || !enabled}>
          {HOLD_MINUTES.map(value => <option key={value} value={value}>{value} phút</option>)}
        </select>
      </label>
    </div>
    {!enabled && <p className="manual-hint">Điều khiển thủ công chưa được cấu hình.</p>}
    {!device.online && <p className="manual-hint">Thiết bị đang offline theo lần đọc gần nhất. Chờ thiết bị kết nối để gửi yêu cầu.</p>}
    {dashboardError && <p className="manual-hint">Đang mất kết nối dashboard. Tạm khóa gửi yêu cầu.</p>}
    {overrides.error && <div className="alert" role="status">Không xác minh được chế độ thủ công: {overrides.error} Trang sẽ tự thử lại.</div>}
    {overrides.value === null && !overrides.error && <p className="manual-hint">Đang đọc chế độ điều khiển…</p>}
    <div className="device-grid">
      {device.states.map(state => {
        const override = overrides.value?.find(item => item.command_type === state.command_type);
        const mode = overrideMode(override, now, verified);
        const name = labels[state.command_type] || state.command_type;
        const adjustable = ['FAN','LIGHT'].includes(state.command_type);
        const unit = state.command_type === 'LIGHT' ? '%' : '/3';
        const latest = commands.find(c => c.device_code === device.code && c.command_type === state.command_type);
        const inFlight = !!latest && ['PENDING','QUEUED','SENT'].includes(latest.status);
        const statusLabels: Record<string,string> = {PENDING:'Đã tạo · chờ điều phối',QUEUED:'Đã xếp hàng · chờ thiết bị nhận',SENT:'Đã gửi · chờ ACK',ACK:'Đã nhận ACK',FAILED:'Thiết bị báo thất bại',TIMED_OUT:'Hết hạn · chưa xác nhận',CANCELLED:'Đã hủy'};
        return <div className="device" key={state.command_type}>
          <div className="device-title"><b>{name}</b><span className={'state ' + (state.actual_state === 'ON' ? 'on' : '')}>Thực tế: {state.actual_state ?? 'CHƯA XÁC NHẬN'}</span></div>
          <p>Mong muốn: <strong>{state.desired_state}{state.desired_level != null ? ` · ${state.desired_level}${unit}` : ''}</strong></p>
          {adjustable && <p>Mức đã xác nhận qua ACK: <strong>{state.actual_level != null ? `${state.actual_level}${unit}` : 'Chưa có dữ liệu mức'}</strong></p>}
          {latest && <p className={`command-feedback ${['FAILED','TIMED_OUT'].includes(latest.status) ? 'command-error' : ''}`} role="status">Lệnh gần nhất: {statusLabels[latest.status] || latest.status}</p>}
          <p>Xác nhận: {state.confirmed_at ? formatTime(state.confirmed_at) : 'Chưa có ACK'}</p>
          <div className={`override-status override-${mode.kind}`}>
            <strong>{mode.label}</strong>
            {mode.kind === 'manual' && <><span className="override-countdown">Còn {countdown(mode.remaining)}</span><small>Hết giữ: {formatTime(override!.expires_at)}</small></>}
          </div>
          {mode.kind === 'manual' && <button className="button" disabled={busy || !verified} onClick={() => void release(override!)}>Trả {name} về AUTO</button>}
          {adjustable && !levelsEnabled && <p className="manual-hint">Backend chưa xác nhận hỗ trợ mức quạt/đèn. Cập nhật backend và migration trước.</p>}
          {adjustable && <label className="level-control">
            {state.command_type === 'FAN' ? 'Mức quạt muốn gửi' : 'Độ sáng đèn muốn gửi'}: <strong>{levels[state.command_type]}{unit}</strong>
            <input type="range" min="1" max={state.command_type === 'FAN' ? 3 : 100} step="1" value={levels[state.command_type]}
              aria-label={`Mức ${name} phòng ${device.room_code}`} disabled={disabled || inFlight || (adjustable && !levelsEnabled)}
              onChange={e => setLevels(v => ({...v,[state.command_type]:Number(e.target.value)}))} />
          </label>}
          <div className="manual-actions">
            <button className="button" disabled={disabled || inFlight || (adjustable && !levelsEnabled)} onClick={() => void submit(state.command_type, 'ON')} aria-label={`Yêu cầu bật ${name} phòng ${device.room_code}`}>{adjustable ? 'Gửi mức đã chọn' : 'Yêu cầu bật'}</button>
            <button className="button" disabled={disabled || inFlight || (adjustable && !levelsEnabled)} onClick={() => void submit(state.command_type, 'OFF')} aria-label={`Yêu cầu tắt ${name} phòng ${device.room_code}`}>Yêu cầu tắt</button>
          </div>
        </div>;
      })}
    </div>
    <p className="manual-hint">Hết thời gian giữ, AUTO được phép xử lý ở lượt tiếp theo; thiết bị không tự tắt ngay khi bộ đếm về 0. Trạng thái thực tế chỉ thay đổi sau ACK.</p>
    {busy && <p className="manual-hint" role="status">Đang gửi yêu cầu…</p>}
    {message && <div className="manual-message" role="status">{message}</div>}
  </div>;
}
