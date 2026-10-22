# Nối n8n vào nền v2

Chưa đóng gói 12 workflow nghiệp vụ. Đây là code base để nhóm viết flow theo contract ổn định. Không import 3 flow cũ trực tiếp rồi kỳ vọng tương thích schema v2 hoàn toàn.

## Chuyển từ smoke test sang nghiệp vụ

Hiện simulator gửi thẳng backend để kiểm tra nền. Khi flow đã sẵn sàng:

- telemetry_url → Webhook production flow01.
- heartbeat_url → Webhook production flow06.
- ack_url → Webhook production flow05.
- claim_url vẫn → backend `/api/commands/claim` (adapter hàng đợi HTTP).

Webhook HTTP input nằm `$json.body`. Normalize body thành item gốc trước logic cũ. Nếu n8n chạy Docker Desktop, URL backend thường là `http://host.docker.internal:3001/api/...`; backend cần HOST=0.0.0.0 trên mạng thử nghiệm tin cậy rồi restart. Backend local mặc định 127.0.0.1 nên container có thể chưa gọi được. Nếu cùng Docker network, dùng tên service khi triển khai sau.

## Trách nhiệm các flow

| Flow | Chủ sở hữu | Kết nối nền |
|---|---|---|
| 01 ingestion | Khoa | Validate → POST telemetry; created=false thì bỏ nhánh xử lý lặp; POST ingestion-errors khi lỗi |
| 02 AI | Khoa | GET policy/context → AI/rule fallback → POST decisions |
| 03 master | Khoa | Quyền ưu tiên/manual/cooldown → POST commands → gọi 04 chỉ với command mới |
| 04 dispatch | Vinh | POST commands/:id/dispatch, đưa QUEUED; simulator tự claim |
| 05 feedback | Vinh | Webhook ACK → POST commands/ack; xử lý FAILED/LATE_ACK theo response |
| 06 health | Vinh | Heartbeat → POST devices/heartbeat; Schedule → check-offline + commands/expire |
| 07 môi trường | Dương | Phân tích ẩm/CO₂/nhiệt → proposal (API bổ sung) |
| 08 năng lượng | Dương | Occupancy/power → proposal; tổng hợp kWh bổ sung |
| 09 ngoài giờ | Dương | Lịch/cửa → incident candidate (API bổ sung) |
| 10 incidents | Hiệp | Dedup/escalation/lifecycle và API ghi bổ sung |
| 11 daily | Hiệp | Tổng hợp + lưu reports; API ghi bổ sung |
| 12 weekly optimization | Hiệp | Rule-based draft/approval; không cần API key và không tự thay policy |

Flow03 nhận manual request từ backend qua N8N_AUTOMATION_WEBHOOK_URL. Chưa có API override nên phải hoàn thiện contract trước khi bật tính năng đó. UI hiện chỉ bật nút khi đã cấu hình webhook; cấu hình URL không chứng minh flow đã xử lý đủ nghiệp vụ.

## Nguyên tắc

- Giữ command_id từ backend, không tự tạo ID thứ hai khi dispatch/ACK.
- Không ghi device_states trực tiếp từ n8n/telemetry; cập nhật qua ACK API.
- Không để flow04 gửi push rồi vẫn chạy claim song song trong cùng demo này. Adapter nền chọn queue/claim; push cần thiết kế bước SENT phù hợp, không tái dùng API nền sai trạng thái.
- Không hardcode localhost khi dịch vụ nằm trong Docker.
- Chỉ export JSON workflow, không commit credential/token.
- File bàn giao có tên 01_SENSOR_INGESTION.json ... 12_WEEKLY_AI_REPORT.json, README cấu hình và execution mẫu.

## WF10–WF12 incidents and reporting API

- WF05–09 post normalized candidate objects to `POST /api/incidents`: `{device_id, type, severity, title, observed_at, details}`. The backend canonicalizes common aliases, deduplicates under a transaction lock by room + type + device, increments repeats, and creates an in-app notification only on first open.
- Incident operations: `GET /api/incidents?room=A101&severity=CRITICAL&status=OPEN&assigned_to=name`, `GET /api/incidents/:uuid`, `PATCH /api/incidents/:uuid` with `status`, `severity`, or `assigned_to`. Detail includes event timeline.
- WF11 calls `POST /api/reports/daily/:room?date=YYYY-MM-DD` (date in room-local timezone). Daily metrics include estimated kWh, average temperature/humidity/CO2, telemetry count, estimated online seconds, command status counts, and incidents. The report upserts by room/type/period.
- WF12 reads `GET /api/reports/weekly/context/:room` and creates a deterministic rule-based DRAFT without an external AI credential. When coverage is insufficient, the draft recommends collecting more telemetry and clearly marks `data_quality=INSUFFICIENT`; with enough data, rules compare weekly averages and incidents against the active policy. All proposals require user approval and never apply policy automatically. Users approve/reject with `PATCH /api/reports/:uuid` and `{ "status": "APPROVED" | "REJECTED" }`.
- Notifications: `GET /api/notifications`; mark read with `PATCH /api/notifications/:uuid/read`.
- Run the scenario walkthrough with `npm run demo:incidents-reports`. In simulator HTTP mode use the new invalid-payload action, duplicate event action, drop-ACK and offline faults. After schema changes run `npm run db:migrate`.

Metrics are estimates based on simulator sampling (5-second sample interval for kWh and online time); adjust those formulas if deployed devices report at a different cadence or use a calibrated energy counter.

### Importable workflow exports

Import `10_INCIDENT_MANAGEMENT.json`, `11_DAILY_REPORT.json`, and `12_WEEKLY_AI_OPTIMIZATION.json` from this folder into n8n. They are inactive on import; review the backend host URL, set `N8N_API_TOKEN` in the n8n process environment to the same value as backend `API_TOKEN` when enabled, then activate. WF10 exposes `/webhook/incident-candidate` for WF05–09 candidates. WF11 runs each day at 00:05 and uses each room's timezone for the report period. WF12 runs Monday at 01:00 Asia/Ho_Chi_Minh and writes a reviewable DRAFT from rules and weekly context. It needs no OpenAI key; insufficient data produces a draft asking for more telemetry, and no proposal changes policy automatically. No credentials are stored in these exports.
