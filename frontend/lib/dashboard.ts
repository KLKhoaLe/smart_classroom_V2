export type SensorValue = number | string | null;

export type DeviceState = {
  command_type: string;
  actual_state: string | null;
  desired_state: string;
  desired_level?: number | null;
  actual_level?: number | null;
  confirmed_at: string | null;
};

export type Device = {
  id: string;
  code: string;
  room_code: string;
  online: boolean;
  last_seen: string | null;
  temperature: SensorValue;
  humidity: SensorValue;
  co2_ppm: SensorValue;
  occupancy_count: SensorValue;
  light_percent: SensorValue;
  power_w: SensorValue;
  observed_at: string | null;
  states: DeviceState[];
};

export type DashboardData = {
  devices: Device[];
  stats: { telemetry_count: number; pending_commands: number; open_incidents: number };
  decisions: { id: string; source: string; reason: string; created_at: string }[];
  manual_enabled: boolean;
  manual_levels_enabled?: boolean;
  server_time?: string;
};

export type Command = {
  id: string;
  device_code: string;
  command_type: string;
  action: string;
  level?: number | null;
  status: string;
  requested_at: string;
};

// Đây là ngưỡng hiển thị dữ liệu cũ, không phải ngưỡng cảnh báo WF07.
export const STALE_AFTER_MS = 30_000;

export function formatSensor(value: SensorValue | undefined, unit = ''): string {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(number)}${unit}`;
}

export function sampleStatus(observedAt: string | null, now: number) {
  if (!observedAt) return { kind: 'missing', label: 'Chưa có mẫu đo' } as const;
  const time = Date.parse(observedAt);
  if (!Number.isFinite(time)) return { kind: 'invalid', label: 'Thời gian mẫu không hợp lệ' } as const;
  const age = now - time;
  if (age < -5_000) return { kind: 'invalid', label: 'Kiểm tra đồng hồ thiết bị / máy tính' } as const;
  return age > STALE_AFTER_MS
    ? { kind: 'stale', label: 'Dữ liệu cũ · hơn 30 giây' } as const
    : { kind: 'fresh', label: 'Dữ liệu mới' } as const;
}

export function formatTime(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Chưa có';
  return new Date(value).toLocaleString('vi-VN');
}
