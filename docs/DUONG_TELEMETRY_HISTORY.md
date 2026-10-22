# Dương — lịch sử cảm biến V2

Ngày chuẩn bị: 21/10/2026. Base main e2b3334. Nhánh đề xuất: feat/duong-telemetry-history.

## Phạm vi

Trang /history, liên kết Lịch sử cảm biến ở sidebar. Chọn thiết bị, một trong sáu thông số và phạm vi tất cả/15 phút/60 phút trong tối đa 100 mẫu gần nhất. Biểu đồ SVG, thống kê min/max/trung bình theo mẫu, bảng dữ liệu, nhãn dữ liệu cũ, giữ dữ liệu khi lỗi và tự đọc lại mỗi 5 giây sau khi request hoàn tất.

Dữ liệu GET /api/telemetry?device_id=UUID từ backend, đã lưu PostgreSQL; không tự tạo số đo. Route frontend GET /api/history chuyển tiếp bộ lọc device_id và API_TOKEN ở server. Không dùng proxy /api/backend/telemetry cũ vì phiên bản base làm mất query string. Không mở API ghi dữ liệu. Không thêm dependency, migration hoặc bảng.

100 mẫu là giới hạn API hiện có, không cam kết tải đủ 60 phút/ngày. Chọn 60 phút chỉ lọc trên số mẫu đã tải. Thống kê là trung bình mẫu, không tính kWh. Trục thời gian theo observed_at; ngắt đường khi giá trị thiếu hoặc khoảng cách >60 giây. Trường thiếu là —; 0 vẫn là 0. Nguồn giả lập hiện đúng nhãn Giả lập. Đổi thiết bị hủy request trước, không dùng dữ liệu phòng cũ cho phòng mới.

## Chạy và thử trên Windows

Tại repo V2, Docker Desktop đã mở:

```powershell
npm run db:up
npm run dev:backend
```

Terminal khác:

```powershell
npm run dev:frontend
```

Terminal khác:

```powershell
npm run dev:simulator
```

Không chạy thêm nếu tiến trình đang chạy đúng cổng. Không cần n8n cho bài thử đọc lịch sử gửi thẳng backend.

Mở http://localhost:4310 → Kết nối n8n. Chọn HTTP. Định danh A101 / ESP32_A101, UUID để trống nếu chưa có. Lưu các URL:
- Telemetry: http://127.0.0.1:3001/api/telemetry
- Heartbeat: http://127.0.0.1:3001/api/devices/heartbeat
- Claim: http://127.0.0.1:3001/api/commands/claim
- ACK: http://127.0.0.1:3001/api/commands/ack

Tắt jitter và ba lỗi giả lập. Khi muốn tạo đúng ba mẫu có thể để phiên stopped và bấm Gửi một mẫu; không cần Start cho bài này.

1. Nhiệt độ27, humidity55, occupancy_count12, co2_ppm650, light_percent65, power_w420. Áp dụng → Gửi một mẫu. Chờ ít nhất2 giây.
2. Nhiệt độ34, occupancy_count25, power_w850. Áp dụng → Gửi một mẫu. Chờ ít nhất2 giây.
3. Nhiệt độ29, occupancy_count0, power_w0. Áp dụng → Gửi một mẫu.
4. Mở http://localhost:3000/history. Chọn thiết bị A101. Ba mẫu mới nhất nhiệt độ27→34→29 xuất hiện sau khi Làm mới lịch sử; DB có mẫu cũ thì vẫn hiển thị cùng100 mẫu gần nhất. Mở bảng để xem chính xác.
5. Chọn Số người/Công suất: mẫu mới nhất bằng0, không phải —.
6. F5: lịch sử vẫn có vì lấy DB, không nằm riêng trong bộ nhớ trình duyệt.
7. Chỉ Ctrl+C terminal backend: sau khoảng5–20s trang báo lỗi nhưng giữ đường đã đọc. Bật lại npm run dev:backend: tự phục hồi.
8. Nếu có hai thiết bị đã seed đúng: đổi phòng, xác nhận không lẫn dữ liệu. Không tự sửa UUID/ghi bảng để tạo phòng trong test này.

Kiểm thử tự động:

```powershell
npm run test:history --prefix frontend
npm test --prefix frontend
npm run typecheck --prefix frontend
```

Dừng terminal frontend trước khi build Windows:

```powershell
npm run build --prefix frontend
```

Kết quả môi trường chuẩn bị:12/12 test lịch sử; typecheck/build đạt. React StrictMode kiểm tra chọn thông số0, giữ đường khi lỗi, phục hồi và đổi thiết bị khi request cũ chưa xong đều đạt. Đây không phải bằng chứng đã chạy trên máy Dương. Ghi kết quả local vào PR sau khi thử.

Nếu build đổi frontend/next-env.d.ts: xem git diff -- frontend/next-env.d.ts. Nếu chỉ chuyển .next/dev/types ↔ .next/types do Next sinh ra thì không đưa vào commit này.

## Giải thích khi demo

“Trang này đọc tối đa100 mẫu gần nhất đã lưu trong PostgreSQL qua backend. Simulator HTTP tạo dữ liệu, backend lưu, frontend đọc. Tải lại trang không mất lịch sử. Khi backend lỗi, frontend giữ số liệu cũ và báo rõ, không tạo số liệu thay thế. Giá trị0 có nghĩa đo được0; dấu — nghĩa chưa có dữ liệu hợp lệ.”

## PR

Title: feat(frontend): add persisted telemetry history charts

Mô tả: Thêm trang lịch sử cảm biến theo thiết bị với6 thông số, biểu đồ theo thời điểm đo, bảng và thống kê mẫu. Route đọc lịch sử giữ đúng device_id và service token ở server. Giữ dữ liệu khi mất kết nối, hủy request khi đổi thiết bị. Không thêm bảng/backend module/dependency. Giới hạn100 mẫu theo API hiện tại.

Checklist local: gửi3mẫu; giá trị0; F5; mất/kết nối lại; test:history; typecheck; build. Không tích mục chưa thử.
