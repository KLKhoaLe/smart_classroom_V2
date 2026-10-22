# API nền Smart Classroom v2 (base URL /api)

Swagger: http://localhost:3001/api/docs. JSON body; validation loại bỏ trường ngoài DTO, từ chối trường bắt buộc sai/thiếu. Dùng service token nếu `API_TOKEN` được đặt, hoặc Bearer token sau khi đăng nhập qua `/api/auth/login`.

## 1. Phân quyền người dùng (RBAC)

Hệ thống hỗ trợ 3 vai trò (Roles) với cấp bậc quyền hạn tăng dần:
- **VIEWER**: Chỉ đọc (Dashboard, Rooms, Devices, Telemetry, Commands, Policies, Overrides, Proposals, Incidents, Reports).
- **OPERATOR**: Quyền Viewer + Điều khiển (Tạo command, dispatch, cancel, claim, ack, manual, override, telemetry ingestion, simulation run).
- **ADMIN**: Toàn quyền (Quản lý User, cập nhật Policy version mới, tạo Schedule, cấu hình hệ thống).

### Tài khoản mẫu đã seed:
- `admin` / `admin123` (Role: `ADMIN`)
- `operator` / `operator123` (Role: `OPERATOR`)
- `viewer` / `viewer123` (Role: `VIEWER`)

---

## 2. Danh mục API đã triển khai (Phiên bản v2 hoàn thiện)

| Method | Path | Role tối thiểu | Vai trò |
|---|---|---|---|
| **GET** | `/health` | Public | DB connected + schema đã migrate |
| **POST** | `/auth/login` | Public | Đăng nhập nhận Bearer token `{username, password}` |
| **GET** | `/auth/me` | VIEWER | Xem thông tin tài khoản hiện tại |
| **GET** | `/rooms` | VIEWER | Danh sách phòng |
| **GET** | `/devices` | VIEWER | Danh sách thiết bị, capabilities và trạng thái online |
| **GET** | `/devices/:ref/states` | VIEWER | Trạng thái desired/actual/simulated của thiết bị |
| **POST** | `/devices/heartbeat` | OPERATOR | `{device_id}`; cập nhật server received time |
| **POST** | `/devices/check-offline` | OPERATOR | Danh sách thiết bị quá 90s không có heartbeat |
| **POST** | `/telemetry` | OPERATOR | Payload v2 simulator; chống trùng `event_id` |
| **GET** | `/telemetry?device_id=...&page=1&limit=20` | VIEWER | Danh sách telemetry, hỗ trợ phân trang chuẩn v2 hoặc mảng v1 |
| **POST** | `/ingestion-errors` | OPERATOR | `{device_code?, reason, raw_payload?}` |
| **POST** | `/decisions` | OPERATOR | `{device_id, telemetry_id?, source, reason, actions, evidence?}` |
| **GET** | `/policies/:room` | VIEWER | Policy active của mã phòng |
| **GET** | `/policies` | VIEWER | Lịch sử tất cả các phiên bản policy |
| **POST** | `/policies/:room` | ADMIN | Tạo version policy mới và kích hoạt |
| **POST** | `/commands` | OPERATOR | Tạo PENDING; kiểm tra capability thiết bị, chống trùng `idempotency_key` |
| **GET** | `/commands?page=1&limit=20` | VIEWER | Danh sách lệnh; hỗ trợ phân trang chuẩn v2 hoặc mảng v1 |
| **GET** | `/commands/:id/status` | VIEWER | Đọc chi tiết và trạng thái lệnh theo UUID |
| **POST** | `/commands/:id/dispatch` | OPERATOR | PENDING → QUEUED |
| **POST** | `/commands/:id/cancel` | OPERATOR | Hủy lệnh PENDING hoặc QUEUED → CANCELLED |
| **POST** | `/commands/claim` | OPERATOR | `{device_id}`; QUEUED → SENT (SKIP LOCKED), trả `{commands:[]}` |
| **POST** | `/commands/ack` | OPERATOR | ACK từ simulator; cập nhật `actual_state` & `simulated_state` |
| **POST** | `/commands/expire` | OPERATOR | Chuyển các lệnh quá TTL sang TIMED_OUT (nguyên tử) |
| **POST** | `/commands/manual` | OPERATOR | Forward sang webhook flow03 |
| **GET** | `/overrides?room=...` | VIEWER | Danh sách manual overrides còn hiệu lực |
| **POST** | `/overrides` | OPERATOR | Đặt ghi đè thủ công có thời hạn `{device_id, command_type, action, override_minutes}` |
| **DELETE**| `/overrides/:ref/:type` | OPERATOR | Hủy ghi đè thủ công, trả về AUTO |
| **GET** | `/proposals?device_id=...`| VIEWER | Danh sách đề xuất điều khiển còn hạn (từ WF07-09) |
| **POST** | `/proposals` | OPERATOR | Lưu đề xuất điều khiển từ flow môi trường/năng lượng |
| **GET** | `/schedules/:room` | VIEWER | Lịch sử dụng phòng học |
| **POST** | `/schedules` | ADMIN | Thêm lịch học mới |
| **GET** | `/simulation/runs` | VIEWER | Danh sách các kịch bản mô phỏng đã chạy |
| **POST** | `/simulation/runs` | OPERATOR | Khởi tạo simulation run mới (cho worker Khoa) |
| **PATCH**| `/simulation/runs/:id` | OPERATOR | Cập nhật trạng thái run (`RUNNING`, `PAUSED`, `STOPPED`) |
| **GET** | `/dashboard` | VIEWER | Tổng quan số liệu thực, độ mới (`freshness_seconds`, `is_stale`), states, `in_sync` |
| **GET** | `/incidents` | VIEWER | Danh sách sự cố (Hiệp phụ trách API ghi) |
| **GET** | `/reports` | VIEWER | Danh sách báo cáo (Hiệp phụ trách API ghi) |

---

## 3. Vòng đời lệnh điều khiển (Command Lifecycle)

```
              ┌─────────(cancel)─────────► CANCELLED
              │
PENDING ──(dispatch)──► QUEUED ──(claim)──► SENT ──(ack SUCCESS)──► ACK
   │                       │                  │  ──(ack FAILED)───► FAILED
   └───────(expire)────────┴─────(expire)─────┴────(expire)───────► TIMED_OUT
```

- **PENDING**: Lệnh mới được tạo, chờ kiểm tra điều phối.
- **QUEUED**: Đã được WF04 dispatch vào hàng đợi, chờ thiết bị claim.
- **SENT**: Simulator đã claim qua `/api/commands/claim` (khóa nguyên tử với `FOR UPDATE SKIP LOCKED`).
- **ACK**: Thiết bị xác nhận thực thi thành công qua ACK. Cập nhật `actual_state` và `device_states`.
- **FAILED**: Thiết bị báo lỗi thực thi.
- **TIMED_OUT**: Lệnh quá `expires_at` mà chưa hoàn tất. Được quét bởi `/api/commands/expire`.
- **CANCELLED**: Lệnh được hủy trước khi thiết bị thực thi qua `/api/commands/:id/cancel`.

---

## 4. Kiểm thử mất ACK & Trạng thái mô phỏng (Simulated State)

Để phục vụ kiểm thử tình huống thiết bị đã đổi trạng thái nhưng mất ACK trên đường truyền:
- `device_states` lưu riêng 3 cột:
  - `desired_state`: Trạng thái mong muốn từ lệnh
  - `actual_state`: Trạng thái chỉ được ghi nhận khi nhận ACK SUCCESS hợp lệ
  - `simulated_state`: Trạng thái mà simulator đang giả lập (truyền qua trường `simulated_state` trong payload ACK hoặc simulator heartbeat)
- Nếu ACK bị mất hoặc timeout, `actual_state` giữ nguyên giá trị cũ, `desired_state` thể hiện mong muốn chưa đạt, và dashboard hiển thị `in_sync: false`.
