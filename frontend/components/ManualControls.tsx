'use client';

import { useEffect, useRef, useState } from 'react';
import { Device, formatTime } from '../lib/dashboard';
import { releaseManualOverride, ManualOverride, countdown, HOLD_MINUTES, manualPayload, overrideMode, sendManualRequest } from '../lib/manual-control';
import { useManualOverrides } from './useManualOverrides';

const labels: Record<string, string> = {
  FAN: 'Quạt', LIGHT: 'Đèn chiếu sáng', VENTILATION: 'Thông gió', DEHUMIDIFIER: 'Máy hút ẩm',
};

export default function ManualControls({ device, enabled, dashboardError, onSent }: {
  device: Device; enabled: boolean; dashboardError: boolean; onSent: () => Promise<void>;
}) {
  const overrides = useManualOverrides(device.id);
  const [minutes, setMinutes] = useState(10);
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
      await sendManualRequest(manualPayload(device.id, commandType, action, minutes), controller.signal);
      clearTimeout(timer);
      if (mounted.current && activePost.current === controller) {
        setMessage(`${labels[commandType] || commandType}: webhook đã nhận yêu cầu ${action === 'ON' ? 'bật' : 'tắt'}, thời gian giữ ${minutes} phút. Chờ xác nhận chế độ và ACK; chưa xác nhận thiết bị thực hiện.`);
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
      <div><h3>Điều khiển thủ công</h3><p>Chọn thời gian giữ cho yêu cầu bật/tắt tiếp theo.</p></div>
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
        return <div className="device" key={state.command_type}>
          <div className="device-title"><b>{name}</b><span className={'state ' + (state.actual_state === 'ON' ? 'on' : '')}>Thực tế: {state.actual_state ?? 'CHƯA XÁC NHẬN'}</span></div>
          <p>Mong muốn: <strong>{state.desired_state}</strong></p>
          <p>Xác nhận: {state.confirmed_at ? formatTime(state.confirmed_at) : 'Chưa có ACK'}</p>
          <div className={`override-status override-${mode.kind}`}>
            <strong>{mode.label}</strong>
            {mode.kind === 'manual' && <><span className="override-countdown">Còn {countdown(mode.remaining)}</span><small>Hết giữ: {formatTime(override!.expires_at)}</small></>}
          </div>
          {mode.kind === 'manual' && <button className="button" disabled={busy || !verified} onClick={() => void release(override!)}>Trả {name} về AUTO</button>}
          <div className="manual-actions">
            <button className="button" disabled={disabled} onClick={() => void submit(state.command_type, 'ON')} aria-label={`Yêu cầu bật ${name} phòng ${device.room_code}`}>Yêu cầu bật</button>
            <button className="button" disabled={disabled} onClick={() => void submit(state.command_type, 'OFF')} aria-label={`Yêu cầu tắt ${name} phòng ${device.room_code}`}>Yêu cầu tắt</button>
          </div>
        </div>;
      })}
    </div>
    <p className="manual-hint">Hết thời gian giữ, AUTO được phép xử lý ở lượt tiếp theo; thiết bị không tự tắt ngay khi bộ đếm về 0. Trạng thái thực tế chỉ thay đổi sau ACK.</p>
    {busy && <p className="manual-hint" role="status">Đang gửi yêu cầu…</p>}
    {message && <div className="manual-message" role="status">{message}</div>}
  </div>;
}
