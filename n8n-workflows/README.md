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
| 12 weekly AI | Hiệp | Draft/approval; chưa tự thay policy |

Flow03 nhận manual request từ backend qua N8N_AUTOMATION_WEBHOOK_URL. Chưa có API override nên phải hoàn thiện contract trước khi bật tính năng đó. UI hiện chỉ bật nút khi đã cấu hình webhook; cấu hình URL không chứng minh flow đã xử lý đủ nghiệp vụ.

## Nguyên tắc

- Giữ command_id từ backend, không tự tạo ID thứ hai khi dispatch/ACK.
- Không ghi device_states trực tiếp từ n8n/telemetry; cập nhật qua ACK API.
- Không để flow04 gửi push rồi vẫn chạy claim song song trong cùng demo này. Adapter nền chọn queue/claim; push cần thiết kế bước SENT phù hợp, không tái dùng API nền sai trạng thái.
- Không hardcode localhost khi dịch vụ nằm trong Docker.
- Chỉ export JSON workflow, không commit credential/token.
- File bàn giao có tên 01_SENSOR_INGESTION.json ... 12_WEEKLY_AI_REPORT.json, README cấu hình và execution mẫu.
