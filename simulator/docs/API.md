# Hợp đồng HTTP simulator v1 / telemetry schema v2

Base: http://localhost:4310. Mọi POST cần `Content-Type: application/json`. Lỗi validation trả 400 `{error: string}`; JSON tối đa 64 KB. Các API quản trị này dùng local, không phải API thay thế NestJS.

## API giao diện local

| Method | Path | Body / mục đích |
|---|---|---|
| GET | /api/health | Kiểm tra tiến trình |
| GET | /api/state | Config, status, sensors, devices, logs, history, counters |
| POST | /api/config | Partial config; lưu file |
| POST | /api/run | `{ "action": "start" }`, `pause` hoặc `stop` |
| POST | /api/scenario | `{ "id": "hot" }`; danh sách ID trong state |
| POST | /api/send | `{}` hoặc `{ "duplicate": true }` |
| POST | /api/heartbeat | Gửi heartbeat ngay |
| POST | /api/commands | Command từ n8n/backend, có thể cần Bearer COMMAND_TOKEN |
| POST | /api/local-command | Chỉ preview: `{ "command_type":"FAN", "action":"ON" }` |
| GET | /api/logs/export | Tải log JSON |
| POST | /api/logs/clear | Xóa log trong RAM |

`/api/send` trả `delivered`, `mode`, `payload`; preview delivered=true nghĩa đã ghi log, KHÔNG gửi mạng. Request chồng nhau trả `{skipped:true}`. `/api/commands` trả ACK với SUCCESS/FAILED; HTTP 200 không thay thế việc kiểm tra status trong ACK.

## Telemetry POST → URL cấu hình

```json
{
  "schema_version": 2,
  "event_id": "uuid",
  "run_id": "uuid",
  "sequence": 1,
  "observed_at": "2026-10-17T13:00:00.000Z",
  "simulated": true,
  "device_id": "ESP32_A101",
  "device_code": "ESP32_A101",
  "room": "A101",
  "room_code": "A101",
  "temperature": 34,
  "humidity": 62,
  "light_percent": 65,
  "light_raw": 1433,
  "occupancy_count": 25,
  "occupancy": true,
  "co2_ppm": 900,
  "power_w": 850,
  "pm25_ug_m3": 12,
  "water_l_min": 0,
  "door_open": false,
  "actual_state": {"FAN":"OFF","LIGHT":"OFF","VENTILATION":"OFF","DEHUMIDIFIER":"OFF"}
}
```

Nhiệt °C, ẩm %, sáng %, CO₂ ppm, công suất W, bụi µg/m³, nước L/min. `device_id` dùng UUID nếu người dùng nhập Device UUID. `room`, `occupancy`, `light_raw` là alias để thuận tiện chuyển đổi flow cũ; không đảm bảo backend cũ chấp nhận các trường bổ sung. Database dedup theo event_id; backend kiểm tra run_id + sequence + observed_at để tránh dữ liệu cũ ghi đè mới.

## Command push

```json
{"command_id":"unique-id","device_id":"ESP32_A101","command_type":"FAN","action":"ON","sequence":1,"expires_at":"2099-01-01T00:00:00Z"}
```

Bắt buộc command_id, một định danh device_id/device_code khớp thiết bị hiện tại, command_type, action. sequence và expires_at tùy chọn nhưng nên có khi backend hoàn thiện. Action ON/OFF. Không hỗ trợ speed/dimmer ở bản này. Nếu contract nhóm dùng `desired_state`, cần map tại flow 04 thành command_type/action hoặc viết adapter; không gửi nguyên desired_state rồi mong tự nhận.

Không dùng lại command_id cho nội dung khác. Command hợp lệ được cache trước khi gửi ACK. Sequence mới hơn kiểm tra theo command_type trong tiến trình hiện tại. Backend cần chịu trách nhiệm bền vững qua restart.

## ACK POST → URL cấu hình

```json
{
 "command_id":"unique-id",
 "device_id":"ESP32_A101",
 "device_code":"ESP32_A101",
 "status":"SUCCESS",
 "result":"SUCCESS",
 "message":"FAN set to ON",
 "command_type":"FAN",
 "actual_state":{"FAN":"ON","LIGHT":"OFF","VENTILATION":"OFF","DEHUMIDIFIER":"OFF"},
 "fan_state":"ON",
 "light_state":"OFF",
 "sequence":1,
 "observed_at":"2026-10-17T13:00:00.000Z",
 "simulated":true
}
```

Trường sequence=null nếu command không có sequence. Sai target hoặc thiếu command_id bị từ chối HTTP400, không sinh ACK. Action/type/expiry sai nhưng đã xác định được command/device sinh ACK FAILED.

## Heartbeat POST → URL cấu hình

Gồm device_id, device_code, room, run_id, observed_at, uptime_ms, simulated. Chu kỳ mặc định 30 giây; flow 06 chọn ngưỡng offline lớn hơn chu kỳ. Không đồng nhất “không có người” với “thiết bị offline”.

## Claim (backend do nhóm cung cấp)

Simulator POST tới claim_url:

```json
{"device_id":"ESP32_A101","device_code":"ESP32_A101","run_id":"uuid"}
```

Backend trả HTTP204 nếu rỗng hoặc HTTP200:

```json
{"commands":[{"command_id":"unique-id","device_id":"ESP32_A101","command_type":"FAN","action":"ON"}]}
```

Nhận tối đa 20 lệnh mỗi response. Backend cần claim nguyên tử, TTL/lease, retry có giới hạn, không trả lặp vô hạn. Simulator không tự tạo hàng đợi command backend. ACK gửi qua URL riêng. Header OUTBOUND_TOKEN áp dụng chung tới telemetry/heartbeat/ack/claim; chỉ cấu hình những endpoint tin cậy thuộc hệ thống của nhóm.
