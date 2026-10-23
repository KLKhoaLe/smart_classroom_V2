export const ACTUATORS = ['FAN', 'LIGHT', 'VENTILATION', 'DEHUMIDIFIER'] as const;
export type Actuator = typeof ACTUATORS[number];
export type ManualAction = 'ON' | 'OFF';
export const HOLD_MINUTES = [1, 5, 10, 15, 30, 60, 120] as const;

export type ManualOverride = {
  id?: string;
  device_id: string;
  command_type: Actuator;
  action: ManualAction;
  level?: number | null;
  expires_at: string;
};

export function parseOverrides(value: unknown, deviceId: string): ManualOverride[] {
  if (!Array.isArray(value)) throw new Error('API chế độ thủ công trả sai định dạng.');
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || row.device_id !== deviceId
      || !ACTUATORS.includes(row.command_type) || !['ON', 'OFF'].includes(row.action)
      || typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at))
      || seen.has(row.command_type)) {
      throw new Error('Dữ liệu chế độ thủ công không hợp lệ.');
    }
    seen.add(row.command_type);
  }
  return value;
}

export function remainingSeconds(expiresAt: string, now: number): number {
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 1000)) : 0;
}

export function countdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function overrideMode(override: ManualOverride | undefined, now: number, verified: boolean) {
  if (!verified) return { kind: 'unknown', label: 'Chưa xác minh chế độ', remaining: 0 } as const;
  const remaining = override ? remainingSeconds(override.expires_at, now) : 0;
  if (override && remaining > 0) return {
    kind: 'manual', label: `THỦ CÔNG · giữ ${override.action === 'ON' ? 'BẬT' : 'TẮT'}`, remaining,
  } as const;
  return { kind: 'auto', label: 'AUTO được phép', remaining: 0 } as const;
}

export function manualPayload(deviceId: string, commandType: string, action: string, minutes: number, level?: number) {
  if (!deviceId || !ACTUATORS.includes(commandType as Actuator) || !['ON', 'OFF'].includes(action)
    || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    throw new Error('Thiết bị, hành động hoặc thời gian giữ không hợp lệ (1–120 phút).');
  }
  if (level !== undefined) {
    const max = commandType === 'FAN' ? 3 : commandType === 'LIGHT' ? 100 : 0;
    if (!max || !Number.isInteger(level) || level < 0 || level > max || (action === 'OFF' ? level !== 0 : level === 0)) throw new Error('Mức quạt/đèn không hợp lệ.');
  }
  return { device_id: deviceId, command_type: commandType, action, override_minutes: minutes, ...(level !== undefined ? {level} : {}) };
}

// API này chỉ xác nhận webhook nhận yêu cầu. Actual vẫn phải đọc từ dashboard/ACK.
export async function sendManualRequest(
  payload: ReturnType<typeof manualPayload>,
  signal: AbortSignal,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  const response = await fetcher('/api/backend/commands/manual', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message || body?.error;
    throw new Error(typeof message === 'string' ? message : `Gửi yêu cầu thất bại (HTTP ${response.status}).`);
  }
  if (body?.accepted !== true) throw new Error('Phản hồi chưa xác nhận đã nhận yêu cầu. Kiểm tra backend/flow03 trước khi gửi lại.');
}

export async function releaseManualOverride(deviceId: string, override: ManualOverride, signal: AbortSignal): Promise<{ awaiting_ack: boolean }> {
  const response = await fetch(`/api/backend/overrides/${encodeURIComponent(deviceId)}/${override.command_type}`, {
    method: 'DELETE', headers: {'content-type':'application/json'}, signal,
    body: JSON.stringify({expected_id: override.id, expected_expires_at: override.expires_at}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || body?.mode !== 'AUTO') throw new Error(body?.message || body?.error || 'Chưa xác nhận trả về AUTO.');
  return {awaiting_ack: body.awaiting_ack === true};
}
