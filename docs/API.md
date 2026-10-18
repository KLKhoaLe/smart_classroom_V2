# API nền (base URL /api)

Swagger: http://localhost:3001/api/docs. JSON body; validation loại bỏ trường ngoài DTO, từ chối trường bắt buộc sai/thiếu. Dùng service token nếu API_TOKEN được đặt.

## Các API thực sự đã triển khai

| Method | Path | Vai trò |
|---|---|---|
| GET | /health | DB connected + schema đã migrate |
| GET | /rooms | Danh sách phòng |
| GET | /devices | Thiết bị và online suy ra từ last_seen |
| GET | /devices/:ref/states | desired/actual, ref là code hoặc UUID |
| POST | /devices/heartbeat | `{device_id}`; cập nhật server received time |
| POST | /devices/check-offline | Danh sách quá 90s / chưa có heartbeat |
| POST | /telemetry | Payload v2 simulator; trả created + telemetry |
| GET | /telemetry?device_id=... | 100 mẫu gần nhất theo observed_at |
| POST | /ingestion-errors | `{device_code?, reason, raw_payload?}` |
| POST | /decisions | `{device_id, telemetry_id?, source, reason, actions, evidence?}` |
| GET | /policies/:room | Policy active của mã phòng |
| POST | /commands | Tạo PENDING; idempotency_key bắt buộc |
| GET | /commands | 100 lệnh mới nhất |
| GET | /commands/:id/status | Đọc lệnh/trạng thái — endpoint này ĐÃ CÓ |
| POST | /commands/:id/dispatch | PENDING → QUEUED; không đẩy MQTT trực tiếp |
| POST | /commands/claim | `{device_id}`; QUEUED → SENT, trả `{commands:[]}` |
| POST | /commands/ack | ACK từ simulator; SUCCESS → ACK / FAILED → FAILED |
| POST | /commands/expire | Chuyển các lệnh quá TTL sang TIMED_OUT |
| POST | /commands/manual | Forward sang webhook flow03; 503 nếu chưa cấu hình |
| GET | /dashboard | Số liệu thực, states, decisions |
| GET | /incidents | Danh sách; API ghi chưa có |
| GET | /reports | Danh sách; API ghi chưa có |

POST mặc định Nest trả 201; simulator chấp nhận mọi HTTP 2xx. UI vẫn phải kiểm tra nội dung trạng thái, không coi HTTP2xx là actuator đã đổi.

## Tạo lệnh thử

```json
{
 "device_id":"ESP32_A101",
 "command_type":"FAN",
 "action":"ON",
 "source":"TEST",
 "idempotency_key":"demo-fan-on-001",
 "ttl_seconds":60
}
```

Trả `{created:true,command:{id,command_id,status:"PENDING",...}}`. Gọi dispatch bằng command_id, sau đó simulator claim. Cùng key + cùng nội dung trả created=false; cùng key + action/device/source/decision khác trả 409. TTL không kéo dài khi retry cùng key. Tạo command OFF phải dùng key mới.

`device_id` đầu vào nhận code hoặc UUID, lưu DB bằng UUID. API output command luôn có UUID device_id và claim kèm device_code. Simulator nhận được cả hai. `command_type` là actuator trong gateway ESP32_A101; hiện một gateway quản lý FAN/LIGHT/VENTILATION/DEHUMIDIFIER.

## ACK

```json
{
 "command_id":"uuid-cua-command",
 "device_id":"ESP32_A101",
 "status":"SUCCESS",
 "actual_state":{"FAN":"ON"},
 "sequence":1
}
```

Sequence phải lấy từ command thực, không dùng số ví dụ cố định. Có thể bỏ sequence nhưng nên giữ khi đã nhận claim. SUCCESS phải có actual_state cho đúng command_type khớp action. Backend chỉ cập nhật một actuator được command điều khiển, không tin nguyên snapshot để ghi đè các actuator khác.

ACK trước SENT trả 409. ACK lặp không tạo thêm event. ACK sau expiry/cancel chỉ ghi LATE_ACK, không đổi actual state. Actual state chỉ cập nhật nếu sequence command mới hơn sequence đã xác nhận. Expiry còn được gọi khi dispatch/claim, nhưng khi không có polling, flow06 cần định kỳ gọi expire để trạng thái không treo.

## Telemetry và tương thích simulator

Xem simulator/docs/API.md. Bắt buộc: device_id, event_id, run_id, sequence, observed_at, temperature, humidity, light_percent, occupancy_count, co2_ppm, power_w, door_open. Các trường mở rộng được lưu raw_payload, các trường cốt lõi có cột số để truy vấn. `occupancy` nếu gửi phải khớp occupancy_count.

- event_id trùng hoàn toàn → created=false; flow01 không xử lý tiếp lần nữa.
- event_id trùng nhưng payload khác → 409.
- observed_at quá 60 giây tương lai → 400.
- Dữ liệu cũ được lưu lịch sử; dashboard lấy observed_at mới nhất nên không bị mẫu cũ ghi đè. Kiểm tra stale trước khi quyết định vẫn thuộc flow01/02.
- Telemetry actual_state chỉ lưu làm bằng chứng; không cập nhật device_states thay ACK.
- Validation HTTP400 không tự lưu ingestion_errors (flow01 ghi lỗi nghiệp vụ qua endpoint riêng).

## Contract chưa triển khai

CRUD proposals, schedules, overrides, policy version/approval, simulation_runs, incidents write/resolve, reports aggregate/write/approve và auth/RBAC sẽ được phát triển theo phân công. Bảng đã chuẩn bị nhưng **không có endpoint stub trả thành công giả**. Nếu gọi endpoint chưa có, nhận 404.

Decision `actions` đang nhận object; policy/schema chi tiết do flow02/03 kiểm tra. `source` decision là AI/RULE/MANUAL, còn command là AUTO/MANUAL/TEST. Đừng dùng lẫn hai loại source.
