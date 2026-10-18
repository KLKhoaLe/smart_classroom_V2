# Smart Classroom — code base v2 (local-first)

Bản nền mới cho nhóm 4 người: **Next.js + NestJS + PostgreSQL + simulator Node.js**, chuẩn bị để nối n8n. Có migration, seed, API nền, dashboard dữ liệu thật và bộ giả lập đã tích hợp vào repo.

**Đây là project riêng, không ghi đè project/DB cũ.** Khởi tạo DB mới `smart_classroom_v2`, cổng host 5433. Không trỏ migration này vào database cũ. Việc chuyển dữ liệu cũ cần migration chuyển đổi riêng sau khi đối chiếu schema.

## 1. Đã có / sẽ làm tiếp

| Phần | Có trong bản nền | Phần nhóm tiếp tục |
|---|---|---|
| PostgreSQL | 15 bảng nghiệp vụ; FK, unique/check/index; migration up/down | Migration bổ sung tính năng |
| NestJS | Validation DTO, Swagger, health, rooms/devices, telemetry, decisions, commands, claim, ACK, expiry, dashboard | Auth người dùng/RBAC; policy/proposal/override CRUD; workflow adapters hoàn chỉnh |
| Lệnh | Idempotency, queue, claim nguyên tử, ACK, trạng thái mong muốn/thực tế, timeout, ACK muộn | Chính sách retry/lease nâng cao, điều phối flow 03 |
| Next.js | Dashboard sáng, dữ liệu API thật, lịch sử lệnh/quyết định, liên kết simulator | UI hoàn thiện, quản trị, charts/report chi tiết |
| Simulator | Toàn bộ project đã gửi trước; setup điền URL API nền | Chuyển URL sang n8n, UI tích hợp sâu nếu cần |
| Sự cố / báo cáo | Bảng DB, API GET và trang rỗng có thông báo | API ghi, xử lý nghiệp vụ, flow 10–12 |
| n8n | Tài liệu contract và phân công flow | Nhóm triển khai 12 flow; không có JSON giả đánh dấu hoàn thành |

Bản nền **chạy kiểm tra xuyên suốt không cần n8n**: simulator → backend → DB; command TEST → queue → simulator → ACK → dashboard. Đây chỉ là smoke test nền. Khi làm nghiệp vụ, đổi các đường dữ liệu sang n8n; AI/rule vẫn thuộc flow, không nhét vào backend hoặc simulator.

## 2. Chuẩn bị

- Node.js >=22.9 (phiên bản 22.23.3 của bạn phù hợp).
- Docker Desktop đang chạy, Docker Compose sẵn sàng.
- Dừng frontend/backend cũ nếu đang chiếm 3000/3001. Dừng simulator cũ nếu đang chiếm 4310.
- n8n cũ cổng 5678 có thể giữ nguyên; Compose này chỉ chạy PostgreSQL mới.

| Thành phần | Địa chỉ local |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3001/api |
| Swagger | http://localhost:3001/api/docs |
| Simulator | http://localhost:4310 |
| PostgreSQL v2 | 127.0.0.1:5433 (container bên trong 5432) |

## 3. Setup lần đầu — PowerShell

Giải nén, mở terminal tại thư mục **smart-classroom-base** có package.json và compose.yaml:

```powershell
node -v
docker version
npm run setup
npm run install:all
npm run db:up
```

`setup` chỉ tạo các file môi trường/config chưa tồn tại, không ghi đè cấu hình đã sửa. `install:all` dùng `npm ci` và hai package-lock đã đính kèm. Không cần chạy npm install ở thư mục gốc.

Đợi PostgreSQL healthy:

```powershell
docker compose ps
```

Sau đó:

```powershell
npm run db:migrate
npm run db:seed
npm run db:status
```

- migration tạo cấu trúc DB và bảng `schema_migrations` quản lý lịch sử.
- seed tạo A101, gateway ESP32_A101, 4 state thiết bị và policy mẫu.
- seed chạy lại không nhân đôi / không đổi policy người dùng đã chỉnh.
- `db:status` hiện `[X]` cho migration đã chạy.
- Backend từ chối khởi động nếu còn migration chưa chạy, tránh code mới chạy trên schema cũ.

## 4. Chạy ứng dụng (3 terminal)

Mỗi terminal đều ở thư mục gốc project:

```powershell
# Terminal 1
npm run dev:backend
```

```powershell
# Terminal 2
npm run dev:frontend
```

```powershell
# Terminal 3
npm run dev:simulator
```

Mở http://localhost:3000 và http://localhost:4310. Chưa gửi dữ liệu thì dashboard có dấu `—`, thiết bị “CHƯA XÁC NHẬN”; không tạo số liệu giả trên dashboard.

## 5. Demo nền hoàn chỉnh trước khi nối n8n

1. Trên simulator → Kết nối n8n → đổi **Xem trước** sang **HTTP**, giữ URL đã setup.
2. Bấm Lưu cấu hình. Chọn kịch bản và bấm **Bắt đầu**.
3. Dashboard cổng 3000 cập nhật sau tối đa khoảng 4 giây. Có nhiệt độ, độ ẩm, số người… là đã đi qua backend + DB.
4. Mở terminal thứ tư, tại thư mục gốc:

```powershell
npm run smoke
```

Script tạo một command **TEST / FAN ON**, chuyển QUEUED. Simulator claim → thực thi → gửi ACK. Script báo PASS nếu trong 15 giây nhận ACK. Dashboard đổi actual FAN thành ON.

Lệnh TEST là kiểm tra kỹ thuật, không phải quyết định AI. Không dùng dữ liệu smoke test để khẳng định flow 01–12 đã hoàn thành. Muốn kiểm tra OFF, có thể gọi API theo `docs/API.md`, luôn dùng idempotency_key mới.

Nút điều khiển thủ công trên dashboard đang vô hiệu nếu chưa có `N8N_AUTOMATION_WEBHOOK_URL`. Sau khi có flow 03, cấu hình URL và restart backend. Dashboard gửi yêu cầu qua flow 03, không đi tắt tới actuator. Backend không tự tạo override; flow 03 và API override là phần tiếp tục hoàn thiện.

## 6. Migration để cả nhóm đồng bộ DB

**Sau khi pull code mới**, nếu dependencies thay đổi thì cài lại; sau đó chạy migration:

```powershell
git pull
npm run install:all
npm run db:status
npm run db:migrate
npm run db:seed
```

Mỗi máy có DB riêng nhưng chạy cùng migration → cùng cấu trúc. Migration **không đồng bộ telemetry/lịch sử lệnh giữa các máy**. Muốn dùng chung dữ liệu phải kết nối chung một DB triển khai của nhóm.

Không bật `synchronize:true`, không tự tạo/sửa bảng thủ công trong pgAdmin rồi quên đưa vào migration. Chi tiết viết migration, review và rollback tại **docs/MIGRATIONS.md**.

## 7. Tổ chức code

```text
backend/
  src/database/data-source.ts       Cấu hình TypeORM, synchronize:false
  src/database/migrations/          Nguồn schema chính thức
  src/database/seed.ts              Dữ liệu nền idempotent
  src/common/dto.ts                 Contract + validation + Swagger
  src/common/local.guard.ts         Service token tùy chọn, kiểm tra Origin
  src/modules/device.service.ts     Phòng, thiết bị, heartbeat, policy GET
  src/modules/telemetry.service.ts  Telemetry, ingestion errors, decisions
  src/modules/commands.service.ts   Vòng đời command/ACK
  src/modules/dashboard.service.ts Dashboard, đọc incidents/reports
  src/modules/api.controller.ts    Các HTTP route nền
frontend/
  app/                             Trang và API proxy phía server
  components/                      Dashboard, khung records
simulator/                         Bộ giả lập riêng, giữ engine chạy Node
n8n-workflows/                      Quy ước tích hợp và phân công
scripts/                           Setup và smoke test
db/                               Tài liệu schema
docs/                             Hướng dẫn migration/API/kiến trúc/bàn giao
```

**SQL-first với TypeORM:** dùng TypeORM DataSource/transaction/migration, viết query có parameter. Chưa tạo entity trùng với toàn bộ schema; migration là nguồn sự thật duy nhất. Viết migration thủ công bằng `migration:create`; không dùng `migration:generate` khi chưa có entity metadata đầy đủ, vì có thể sinh SQL xóa bảng ngoài ý muốn.

## 8. Cấu hình môi trường

| File | Mục đích |
|---|---|
| `.env` | Docker PostgreSQL: DB/user/password/port |
| `backend/.env` | NestJS kết nối DB và webhook n8n |
| `frontend/.env.local` | URL backend; token chỉ ở server |
| `simulator/.env` | Port/host và OUTBOUND_TOKEN |
| `simulator/data/config.json` | Cấu hình cảm biến và URL; do setup/UI lưu |

Nếu đổi DB credential/port, sửa **cả root .env và backend/.env**. Đổi POSTGRES_PASSWORD trong compose sau khi volume đã tạo **không tự đổi mật khẩu trong DB**; cần thao tác thay mật khẩu có chủ đích hoặc giữ credential hiện tại.

Mặc định API_TOKEN trống để demo local đơn giản. Nếu đặt API_TOKEN ở backend, đặt cùng giá trị trong frontend API_TOKEN và simulator OUTBOUND_TOKEN; credential n8n dùng `Authorization: Bearer ...`. Token frontend không có tiền tố NEXT_PUBLIC nên không gửi ra trình duyệt.

Bản nền chưa có đăng nhập người dùng/RBAC. Backend và PostgreSQL mặc định nghe loopback. Chưa đủ điều kiện mở public; lúc host cần auth, HTTPS, cấu hình quyền và reverse proxy. Docker Compose hiện phục vụ DB local, không phải bản triển khai full production.

## 9. Test và build

```powershell
npm test
npm run build
```

- Backend: 2 bài tích hợp lớn gồm nhiều assertion trên PostgreSQL nhúng PGlite và Nest HTTP, kiểm tra migration up/down/up, seed, dedup, queue/ACK và simulator.
- Simulator: 11 test logic/HTTP.
- Frontend: TypeScript + production build đã đạt trong môi trường tạo project.
- Chưa chạy Docker PostgreSQL 16 trên máy người dùng; `db:migrate` + `smoke` là nghiệm thu local bắt buộc sau giải nén.
- Chưa có kiểm tra trực quan trình duyệt tự động; frontend đã build nhưng cần mở Chrome/Edge để nghiệm thu hiển thị.

## 10. Vấn đề thường gặp

- `ECONNREFUSED ...5433`: Docker chưa chạy, PostgreSQL chưa healthy hoặc sai port.
- “còn migration chưa chạy”: tắt backend, chạy `npm run db:migrate`, mở lại backend.
- `password authentication failed`: root/ backend .env không khớp hoặc volume đã có credential cũ.
- Dashboard lỗi backend: mở `/api/health`, kiểm tra backend terminal, URL/token frontend.
- Simulator có HTTP400: xem ValidationPipe trả lỗi; telemetry cần schema v2, không chỉ 5 trường kiểu Wokwi cũ.
- Smoke không ACK: simulator phải ở HTTP, bấm Start, claim_url và ack_url trỏ backend mới; tắt fault.
- Smoke command TIMED_OUT: tạo lệnh mới bằng chạy lại smoke sau khi sửa, không tái sử dụng lệnh hết hạn.
- N8n Docker không gọi được host: xem n8n-workflows/README; `localhost` trong container không phải máy host.
- Port 3000/3001/4310 đang dùng: dừng app cũ trước, hoặc đổi đồng bộ các URL liên quan.

## 11. Tài liệu chính thức đã đối chiếu

- https://docs.nestjs.com/techniques/database
- https://typeorm.io/docs/advanced-topics/migrations/
- https://nextjs.org/docs/app/getting-started/installation

Không cần Vite cho frontend Next.js này; Next.js có hệ thống dev/build riêng.
