const getPaths = new Set(['dashboard', 'rooms', 'devices', 'commands', 'telemetry', 'incidents', 'reports', 'health']);

export function isAllowedBackendGet(path: readonly string[]): boolean {
  if (path.length === 1) return getPaths.has(path[0]);
  // Chỉ mở API đọc override đã có; không mở toàn bộ nhóm automation.
  return path.length === 3 && path[0] === 'automation' && path[1] === 'overrides'
    && /^[A-Za-z0-9_-]{1,100}$/.test(path[2]);
}
