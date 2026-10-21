// UI-only helpers. These do not change simulator state or send commands.
export function connectionPreset(kind) {
  const base = 'http://127.0.0.1:3001/api';
  const preset = { mode: 'http', telemetry_url: `${base}/telemetry`, heartbeat_url: `${base}/devices/heartbeat`,
    claim_url: `${base}/commands/claim`, ack_url: `${base}/commands/ack` };
  if (kind === 'flow01') preset.telemetry_url = 'http://localhost:5678/webhook/simulator-telemetry';
  else if (kind !== 'backend') throw new Error('Cấu hình mẫu không hợp lệ.');
  return preset;
}
export function connectionSummary(config, status) {
  const notes = [];
  if (config.mode !== 'http') notes.push('Đang xem trước: không gửi dữ liệu đến backend/n8n.');
  for (const [key, label] of [['telemetry_url','Telemetry'],['heartbeat_url','Heartbeat'],['claim_url','Nhận lệnh (claim)'],['ack_url','ACK']]) {
    if (!config[key]) notes.push(`Chưa cấu hình ${label}.`);
  }
  if (config.faults.offline) notes.push('Đang giả lập mất kết nối: ngừng gửi và nhận lệnh.');
  if (config.faults.drop_ack) notes.push('Đang bật Không trả ACK: frontend chưa thể xác nhận trạng thái mới.');
  if (config.faults.fail_command) notes.push('Đang bật Lỗi thực thi: thiết bị sẽ trả FAILED.');
  if (status === 'stopped') notes.push('Phiên đã dừng. Bấm Bắt đầu để chạy heartbeat và nhận lệnh định kỳ.');
  if (status === 'paused') notes.push('Chỉ tạm dừng telemetry; heartbeat và nhận lệnh vẫn tiếp tục.');
  return notes;
}
export function commandEvidence(logs, mode) {
  const command = logs.find(log => ['command','error'].includes(log.type) && log.data?.command_id && ['SUCCESS','FAILED'].includes(log.data.status));
  if (!command) return null;
  // Logs are newest first. ACK evidence must belong to this exact command.
  const events = logs.filter(log => log.data?.command_id === command.data.command_id);
  const sent = events.find(log => log.type === 'success' && /^ACK: HTTP /.test(log.message));
  const dropped = events.find(log => log.type === 'warning' && log.message.includes('Cố ý bỏ ACK'));
  const failure = events.find(log => log.type === 'error' && log.message.startsWith('ACK'));
  return { id: command.data.command_id, actuator: command.data.command_type, status: command.data.status,
    time: command.time, executed: command.data.status === 'SUCCESS',
    ack: mode !== 'http' ? 'Xem trước — chưa gửi ACK qua HTTP' : sent ? 'ACK đã nhận HTTP 2xx — đối chiếu trạng thái backend' : dropped ? 'ACK bị bỏ theo cấu hình kiểm thử' : failure ? 'Gửi ACK lỗi — xem nhật ký' : 'Chưa có bằng chứng HTTP ACK trong nhật ký hiện có' };
}
