# Database v2

Nguồn SQL chính thức: `backend/src/database/migrations/1792200000000-InitialSchema.ts`.
Không có init.sql chạy song song với migration; tránh hai cách tạo schema khác nhau.

## 15 bảng nghiệp vụ

| Bảng | Mục đích |
|---|---|
| rooms | Phòng, mã, múi giờ |
| devices | Gateway/simulator thuộc phòng, last_seen |
| device_states | Một hàng mỗi actuator, desired/actual + sequence |
| telemetry | Bản đo, event_id unique, thời điểm, raw_payload |
| ingestion_errors | Dữ liệu lỗi do flow01 ghi |
| automation_decisions | Lý do và actions của AI/rule/manual |
| control_proposals | Đề xuất từ flow07–09, có thời hạn |
| device_commands | Command, idempotency key, sequence, TTL, trạng thái |
| device_events | ACK/FAILED/LATE_ACK và sự kiện thiết bị |
| policies | Policy theo phòng và version, tối đa một active |
| schedules | Lịch phòng, weekday 0=Chủ nhật; chưa hỗ trợ lịch qua đêm |
| manual_overrides | Override theo thiết bị/actuator; API chưa có |
| incidents | Sự cố; unique dedup_key cho các bản chưa RESOLVED |
| reports | Báo cáo theo phòng/kỳ/loại |
| simulation_runs | Khung quản lý run; simulator hiện vẫn giữ run trong tiến trình |

Ngoài ra TypeORM tạo `schema_migrations` để quản lý version. Không lưu credentials n8n vào DB ứng dụng.

Gateway A101 có UUID `20000000-0000-4000-8000-000000000001`, code `ESP32_A101`. Bốn actuator là FAN, LIGHT, VENTILATION, DEHUMIDIFIER trong device_states, không phải bốn gateway riêng. UI actual_state ban đầu NULL = chưa xác nhận.

Telemetry không có cột occupancy boolean: dùng occupancy_count>0, tránh lưu hai giá trị mâu thuẫn. power_w là công suất, chưa phải kWh; report tổng hợp điện năng là phần tiếp tục. PM2.5/water nằm raw_payload ở bản nền; có thể thêm cột qua migration khi cần truy vấn riêng.

## Kết nối bằng pgAdmin/DBeaver

Host 127.0.0.1; port 5433; DB smart_classroom_v2; user smartuser; password theo .env. Cấu hình mẫu chỉ cho local.

## Sao lưu local bằng Docker

Từ root project, dùng đúng DB/user của .env. Lệnh mặc định:

```powershell
docker compose exec -T postgres pg_dump -U smartuser -d smart_classroom_v2 -Fc -f /tmp/classroom.dump
docker compose cp postgres:/tmp/classroom.dump ./classroom-backup.dump
```

Dump dạng custom, khôi phục bằng pg_restore trên DB đích đã chuẩn bị và có chủ đích. Không cung cấp lệnh tự xóa DB để reset. `docker compose down` giữ volume; `down -v` xóa volume và dữ liệu.
