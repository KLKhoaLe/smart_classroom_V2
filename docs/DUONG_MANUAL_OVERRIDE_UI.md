# Dương — giao diện giữ điều khiển thủ công

## Mục tiêu và phạm vi

Cho người dùng chọn thời gian giữ một yêu cầu bật/tắt, xem chế độ hiện tại và bộ đếm còn lại. Frontend dùng API mới của Khoa trên main `e2b3334`; không thêm module/bảng backend và không thay engine simulator hay flow03.

Bản này hoàn thiện UI trên contract đang có: chọn 1/5/10/15/30/60/120 phút, yêu cầu bật/tắt riêng, đọc override từ backend, đếm ngược và xử lý mất kết nối. Backend hiện chưa có API hủy override sớm nên UI không có nút hủy sớm. Hết thời hạn chỉ cho AUTO xử lý lượt sau, không tạo lệnh OFF tự động ở frontend.

## Luồng cần hiểu khi demo

Frontend → Next.js proxy → POST /api/commands/manual → webhook flow03 → POST /api/automation/resolve → đăng ký override/tạo command → guarded dispatch → simulator claim → ACK → backend cập nhật actual_state → dashboard đọc lên.

Frontend đọc GET /api/automation/overrides/:device mỗi đợt cách nhau 4 giây sau khi request trước hoàn tất. Bộ đếm lấy expires_at do backend trả về, không đếm từ lúc người dùng bấm nút nên tải lại trang không làm kéo dài override. Đồng hồ máy cần đúng giờ.

Ba khái niệm riêng:

- Mong muốn (desired): trạng thái hệ thống yêu cầu.
- Thực tế (actual): trạng thái đã được backend xác nhận từ ACK.
- Giữ thủ công (override): trong thời hạn này AUTO không được thay lệnh của actuator đó theo backend hiện tại.

HTTP accepted chỉ xác nhận webhook nhận request. Flow03 có thể không tạo lệnh vì offline, AWAITING_ACK hoặc guard khác. UI không tự báo đã thực hiện, không tự đổi actual và không tự tạo bộ đếm; phải đọc override từ server. Nếu không thấy override/command sau khi đã accepted, xem execution flow03 và reason/skipped.

Nếu API lỗi, hiển thị Chưa xác minh chế độ, tạm khóa nút gửi, không gắn nhãn AUTO dựa trên cache cũ. Không tự retry POST vì backend đang tạo request_id mới cho mỗi lần gửi; timeout không chứng minh yêu cầu chưa xử lý.

## API dùng trong PR

| Đường gọi từ trình duyệt | Backend tương ứng |
| --- | --- |
| POST /api/backend/commands/manual | POST /api/commands/manual |
| GET /api/backend/automation/overrides/<UUID> | GET /api/automation/overrides/<UUID> |

Proxy chỉ cho phép thêm đúng GET override; không mở rộng toàn bộ automation. Token vẫn nằm trong cấu hình server Next.js, không đưa vào code client.

## Chuẩn bị trên máy Dương

### Cập nhật nền và database

Dừng backend/frontend đang chạy bằng Ctrl+C trước khi cập nhật. Sau khi pull main, cài dependencies, mở Docker Desktop rồi chạy từ gốc repo:

```powershell
npm run install:all
npm run db:up
docker compose ps
```

Đợi postgres healthy, sau đó:

```powershell
npm run db:migrate
npm run db:seed
npm run db:status
```

Main mới có migration AutomationRunsV3. Phải chạy migration trước khi backend khởi động. Không xóa volume hoặc dùng SQL V1.

### Chạy backend/frontend/simulator

Mỗi lệnh ở một terminal riêng, tất cả tại gốc repo:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

```powershell
npm run dev:simulator
```

Kiểm tra http://localhost:3001/api/health, http://localhost:3000 và http://localhost:4310.

Simulator → Kết nối n8n → HTTP, giữ telemetry/heartbeat/claim/ACK trỏ backend để thử riêng tính năng này:

- telemetry_url: http://127.0.0.1:3001/api/telemetry
- heartbeat_url: http://127.0.0.1:3001/api/devices/heartbeat
- claim_url: http://127.0.0.1:3001/api/commands/claim
- ack_url: http://127.0.0.1:3001/api/commands/ack

Lưu cấu hình → Bắt đầu. Tắt các fault offline, drop_ack, fail_command trước bài thử bình thường. Chờ dashboard Online.

### Cần flow03 để thực sự gửi lệnh thủ công

Khác PR trước chỉ đọc cảm biến, bài thử này cần flow03. File đã nằm trong repo: `n8n-workflows/03_MASTER_AUTOMATION_V3.json` (V3 là tên phiên bản workflow của Khoa, repo vẫn là smart_classroom_V2).

1. Mở http://localhost:5678. Nếu n8n đã chạy thì giữ nguyên.
2. Nếu chưa chạy, kiểm tra bằng `docker ps -a --filter "name=^/n8n$"`. Nếu có container n8n đang dừng, chạy `docker start n8n`.
3. Chỉ khi chưa có container n8n, mở terminal riêng và dùng lệnh quen thuộc:

```powershell
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

4. Nếu chưa có flow03 V3, trong n8n mở menu workflow → Import from File → chọn file JSON nói trên. Không import đè flow cũ đang dùng; nếu đã có đúng bản V3 thì mở bản đó.
5. Node Configuration: `backend_base_url` là `http://host.docker.internal:3001`, `dispatch_mode` là `BACKEND`.
6. Lưu và Publish/Activate workflow để Production URL của node Manual Control Webhook hoạt động. Đường dẫn cần là `/webhook/master-automation-v3`, không dùng `/webhook-test/` cho cấu hình backend lâu dài. Nếu trùng webhook, chỉ bật một workflow có đường dẫn đó.
7. Mở `backend/.env` trong VS Code. Sửa các dòng tương ứng (không thêm trùng):

```dotenv
HOST=0.0.0.0
N8N_AUTOMATION_WEBHOOK_URL=http://localhost:5678/webhook/master-automation-v3
```

HOST này cho phép n8n Docker gọi backend trên máy Windows trong môi trường demo. Nếu nhóm đã dùng URL/host khác thì giữ cấu hình nhóm đã xác nhận. Không commit .env.

8. Ctrl+C terminal backend và chạy lại `npm run dev:backend`. Đợi dashboard cập nhật.
9. Nếu API_TOKEN đang được bật, cấu hình Header Auth cho các HTTP Request gọi backend trong flow03 theo hướng dẫn của Khoa; token không ghi trực tiếp vào JSON workflow. Không xóa token đang dùng để né lỗi.

Kiểm tra từ Docker nếu node flow03 không gọi được backend:

```powershell
docker exec n8n node -e "fetch('http://host.docker.internal:3001/api/health').then(async r=>console.log(r.status,await r.text())).catch(e=>console.error(e.message,e.cause?.code))"
```

200 là gọi tới backend được. 401/403 có thể do API token; lỗi connection cần kiểm tra HOST và terminal backend.

## Thử commit 1 trước khi push

Chạy `npm run typecheck --prefix frontend`. Mở frontend, tìm Điều khiển thủ công dưới các thông số cảm biến.

### A. Bật thủ công trong 1 phút

1. Kiểm tra thiết bị Online, không có lỗi dashboard/override. Chọn thời gian giữ 1 phút.
2. Ở Quạt bấm Yêu cầu bật.
3. UI báo webhook đã nhận yêu cầu. Chờ 4–10 giây để các API đọc lại dữ liệu.
4. Khi backend đăng ký override: thấy THỦ CÔNG · giữ BẬT và bộ đếm còn khoảng 0:xx.
5. Khi có ACK: Thực tế chuyển ON. Nếu quạt đã ON trước đó, backend có thể chỉ đăng ký override, không cần tạo command mới; đây là ALREADY_CONFIRMED hợp lệ.
6. F5 trang sau khoảng 15 giây. Bộ đếm phải tiếp tục thời gian còn lại, không bắt đầu lại một phút.
7. Chờ hết một phút. Nhãn thành AUTO được phép. Quạt không nhất thiết OFF: phải có lượt AUTO tiếp theo mới ra quyết định.

### B. Tắt / gia hạn chủ động

1. Chọn 5 phút rồi bấm Yêu cầu tắt ở Quạt khi không còn command chờ ACK.
2. Backend xác nhận override thì nhãn giữ TẮT, bộ đếm gần 5 phút; actual OFF chỉ sau ACK.
3. Có thể bấm cùng hành động để tạo yêu cầu giữ mới; backend quyết định có đăng ký được không. Chỉ đổi dropdown mà không bấm gửi thì không thay đổi override đang có.

### C. Mất backend và phục hồi

1. Khi đang có bộ đếm, Ctrl+C chỉ ở terminal backend; giữ frontend/simulator chạy.
2. Đợi khoảng 4–20 giây. UI báo lỗi, nhãn Chưa xác minh chế độ, nút gửi bị khóa. Số telemetry đã nhận vẫn được giữ như PR trước.
3. Chạy lại backend. Trang tự đọc chế độ lại; nếu override còn hạn thì hiện thời gian còn lại, nếu hết hạn thì AUTO được phép.

### D. Không có ACK — không được báo thành công giả

1. Bật fault drop_ack trên simulator và chờ cấu hình được lưu.
2. Gửi hành động ngược với actual hiện tại (actual OFF thì yêu cầu ON; actual ON thì yêu cầu OFF).
3. Có thể thấy desired đổi và override đang giữ, nhưng actual trên dashboard vẫn là lần ACK gần nhất; command có thể đang SENT rồi TIMED_OUT.
4. Tắt drop_ack sau thử. Một lệnh đang chờ có thể tiếp tục chặn lệnh mới cho đến khi hết TTL; chờ rồi tạo yêu cầu mới. Không sửa actual trực tiếp để ép kết quả.

Chụp ảnh bộ đếm, actual/desired và lỗi backend/phục hồi. Nếu chưa cấu hình được flow03 thì chỉ nghiệm thu phần UI đọc được, để PR draft; chưa đánh dấu kiểm thử xuyên suốt đã đạt.

## Thử commit 2

```powershell
npm test --prefix frontend
```

Cần 23 pass, 0 fail (11 test cũ + 12 test mới). Sau đó dừng frontend trước khi build:

```powershell
npm run build --prefix frontend
```

Chờ lệnh kết thúc hoàn toàn không có lỗi, rồi chạy lại frontend. Next.js có thể tự thay đường dẫn trong next-env.d.ts khi đổi dev/build; file sinh tự động này không thuộc PR, không stage nó vào commit.

## Kết quả kiểm tra khi chuẩn bị gói

- 23/23 unit tests đạt.
- Frontend TypeScript và production build đạt.
- React StrictMode + DOM giả lập: dropdown chọn 1 phút; chặn gửi hai lần; accepted không đổi actual; tải lại trang giữ bộ đếm; lỗi API khóa gửi và phục hồi; hết hạn không đổi actual — đạt.
- Chưa chạy n8n Docker/PostgreSQL trên máy Windows Dương. Các bài A–D phải do Dương nghiệm thu local trước khi nhờ merge.

## File và tác dụng

| File | Vai trò |
| --- | --- |
| components/ManualControls.tsx | Dropdown, nút bật/tắt, bộ đếm, trạng thái đọc/gửi |
| components/useManualOverrides.ts | Đọc trạng thái override, hủy request khi rời trang, polling không chồng |
| lib/manual-control.ts | Contract, kiểm tra dữ liệu, đếm thời gian, gửi yêu cầu qua proxy |
| lib/backend-routes.ts | Giới hạn API GET được phép qua frontend proxy |
| app/api/backend/[...path]/route.ts | Cho đọc override bằng proxy server |
| components/Dashboard.tsx | Dùng component điều khiển mới |
| app/globals.css | Giao diện điều khiển và màn hình nhỏ |
| tests/manual-control.test.mjs | 12 bài test bổ sung |

## Mô tả PR đề xuất

Tiêu đề: `feat(frontend): add timed manual override controls`

Dashboard trước đây gửi lệnh giữ cố định 10 phút nhưng chưa hiển thị override đang hoạt động. PR thêm chọn thời gian giữ, nút bật/tắt riêng và bộ đếm đọc từ backend. Khi API lỗi, giao diện báo chưa xác minh và khóa gửi; khi hết hạn, AUTO được phép xử lý tiếp. Actual state vẫn chỉ lấy từ ACK qua dashboard.

Bổ sung 12 bài kiểm tra (tổng frontend 23) và hướng dẫn nghiệm thu. Không thêm bảng/backend API hay sửa flow03. API hủy giữ sớm chưa có nên chưa cung cấp chức năng đó.

Kiểm tra local (chỉ đánh dấu bài đã chạy):

- [ ] 23 tests pass và build thành công.
- [ ] Bật/tắt qua flow03, thấy override và ACK.
- [ ] F5 không kéo dài thời gian giữ.
- [ ] Hết hạn không tự đổi actual.
- [ ] Mất backend → chưa xác minh; phục hồi → đọc lại chế độ.
- [ ] Drop ACK → không báo thiết bị đã thực hiện.
