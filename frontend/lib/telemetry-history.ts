export const METRICS = [
  { key: 'temperature', label: 'Nhiệt độ', unit: '°C' },
  { key: 'humidity', label: 'Độ ẩm', unit: '%' },
  { key: 'co2_ppm', label: 'CO₂', unit: 'ppm' },
  { key: 'light_percent', label: 'Độ sáng', unit: '%' },
  { key: 'occupancy_count', label: 'Số người', unit: 'người' },
  { key: 'power_w', label: 'Công suất', unit: 'W' },
] as const;
export type Metric = typeof METRICS[number]['key'];
export type Sample = { id: string; device_id: string; observed_at: string; time: number; sequence: number; simulated: boolean | null } & Record<Metric, number | null>;
export function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
export function parseSamples(body: unknown, device: string): Sample[] {
  if (!Array.isArray(body)) throw new Error('Lịch sử trả về không đúng định dạng.');
  const seen = new Set<string>();
  const rows: Sample[] = [];
  for (const raw of body) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.device_id !== device
      || typeof raw.observed_at !== 'string' || !Number.isFinite(Date.parse(raw.observed_at))) {
      throw new Error('Mẫu đo sai định danh thiết bị hoặc thời gian.');
    }
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    const values = Object.fromEntries(METRICS.map(({ key }) => [key, numberOrNull(raw[key])])) as Record<Metric, number | null>;
    rows.push({ ...values, id: raw.id, device_id: device, observed_at: raw.observed_at,
      time: Date.parse(raw.observed_at), sequence: numberOrNull(raw.sequence) ?? 0,
      simulated: typeof raw.simulated === 'boolean' ? raw.simulated : null });
  }
  return rows.sort((a, b) => a.time - b.time || a.sequence - b.sequence).slice(-100);
}
export function selectWindow(rows: Sample[], minutes: number, now: number): Sample[] {
  return rows.filter(row => row.time <= now + 5_000 && (minutes === 0 || row.time >= now - minutes * 60_000));
}
export function summary(rows: Sample[], metric: Metric) {
  const values = rows.map(row => row[metric]).filter((value): value is number => value !== null);
  return { count: values.length, min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    mean: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null };
}
// Missing values and interruptions >60s are gaps, never fabricated zeroes.
export function chartGeometry(rows: Sample[], metric: Metric) {
  const stats = summary(rows, metric);
  if (!rows.length || !stats.count) return null;
  const rawMin = stats.min!, rawMax = stats.max!;
  const padding = Math.max((rawMax - rawMin) * .15, rawMax === rawMin ? Math.max(Math.abs(rawMax) * .05, 1) : .5);
  const low = rawMin - padding, high = rawMax + padding;
  const start = rows[0].time, end = rows[rows.length - 1].time;
  const segments: { x: number; y: number; row: Sample; value: number }[][] = [];
  let segment: typeof segments[number] = [];
  let previousTime: number | null = null;
  for (const row of rows) {
    const value = row[metric];
    if (value === null || (previousTime !== null && row.time - previousTime > 60_000)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (value !== null) segment.push({ row, value, x: start === end ? 390 : 70 + (row.time - start) / (end - start) * 640,
      y: 200 - (value - low) / (high - low) * 170 });
    previousTime = row.time;
  }
  if (segment.length) segments.push(segment);
  return { low, high, start, end, segments };
}
