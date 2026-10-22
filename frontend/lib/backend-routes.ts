const getPaths = new Set(['dashboard', 'rooms', 'devices', 'commands', 'telemetry', 'incidents', 'reports', 'notifications', 'health']);

export function isAllowedBackendGet(path: readonly string[]): boolean {
  if (path.length === 1) return getPaths.has(path[0]);
  if ((path[0] === 'incidents' || path[0] === 'reports') && path.length === 2 && /^[0-9a-f-]{36}$/i.test(path[1])) return true;
  if(path.length===3 && path[0]==='reports' && path[1]==='weekly' && path[2]==='context') return false;
  if(path.length===4 && path[0]==='reports' && path[1]==='weekly' && path[2]==='context' && /^[A-Za-z0-9_-]{1,100}$/.test(path[3])) return true;
  // Chỉ mở API đọc override đã có; không mở toàn bộ nhóm automation.
  return path.length === 3 && path[0] === 'automation' && path[1] === 'overrides'
    && /^[A-Za-z0-9_-]{1,100}$/.test(path[2]);
}

export function isAllowedBackendMutation(method: string, path: readonly string[]): boolean {
  const route=path.join('/');
  if(method==='POST' && ['commands/manual','incidents','reports'].includes(route)) return true;
  if(method==='POST' && /^reports\/daily\/[A-Za-z0-9_-]{1,100}$/.test(route)) return true;
  if(method==='POST' && /^reports\/weekly\/[A-Za-z0-9_-]{1,100}$/.test(route)) return true;
  if(method==='PATCH' && /^(incidents|reports)\/[0-9a-f-]{36}$/i.test(route)) return true;
  if(method==='PATCH' && /^notifications\/[0-9a-f-]{36}\/read$/i.test(route)) return true;
  return false;
}
