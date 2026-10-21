# Dương — UI simulator để demo V2

Nhánh feat/duong-simulator-demo-ui. Base main e2b3334, ngày21/10/2026. Không thay engine, chu kỳ, retry, xác thực, schema hoặc trạng thái actuator.

## Thay đổi

- Kết nối n8n có2 nút điền mẫu: backend trực tiếp và telemetry qua flow01.
- Bấm điền mẫu CHƯA lưu. Phải bấm Lưu cấu hình. Giữ định danh/cảm biến đang có.
- Backend trực tiếp kiểm tra nền; không phải toàn bộ nghiệp vụ n8n.
- Flow01 preset: telemetry → /webhook/simulator-telemetry; heartbeat/claim/ACK → backend. Chưa đi qua flow05/06.
- Bảng kiểm tra trước demo: mode preview/HTTP, URL thiếu, stopped/paused, các lỗi giả lập và địa chỉ đã lưu.
- Lệnh/phản hồi gần nhất: command_id, actuator, SUCCESS/FAILED, bằng chứng HTTP ACK đúng cùng ID, số ACK chờ gửi lại. HTTP2xx không chứng minh backend cập nhật actual; phải đối chiếu dashboard.
- Chỉ thêm asset demo-ui.js vào danh sách static server; không đổi route nghiệp vụ.

## Test local

```powershell
npm test --prefix simulator
npm run dev:simulator
```

1. Mở http://localhost:4310. Vào Kết nối n8n → Kiểm tra nền — gửi thẳng backend. Thấy URL điền vào form nhưng chưa áp dụng; bấm Lưu cấu hình. Không đổi Device UUID bằng giá trị đoán; dùng mã ESP32_A101 nếu UUID trống.
2. Vào Bảng mô phỏng: xem mode HTTP và4URL đã lưu. Bắt đầu: trạng thái stopped biến mất. Preview không được báo đã gửi thật.
3. Tạm dừng: dòng giải thích heartbeat/nhận lệnh vẫn tiếp tục. Bắt đầu để tiếp tục telemetry.
4. Bật thử Không trả ACK: dòng nhắc hiện rõ. Tắt lại trước demo bình thường.
5. Khi flow03/manual đã nối đúng: gửi lệnh đổi FAN từ dashboard. Kiểm tra command_id, SUCCESS và ACK HTTP. Dashboard phải nhận actual sau ACK. “SUCCESS” trong simulator đơn lẻ chưa đủ xác nhận DB.
6. Bấm Xem nhật ký lệnh / ACK: tự lọc theo command_id tương ứng. Xóa log thì panel báo chưa có bằng chứng trong nhật ký hiện có, không khẳng định lệnh chưa từng chạy.
7. Nếu muốn thử flow01 preset: import/publish01_SENSOR_DATA_INGESTION_V3 trước. Đây vẫn chỉ là telemetry qua01, chưa đủ đường01–06.

Môi trường chuẩn bị:18/18 test simulator (bao gồm11 test nền và7 test UI helper); test HTTP thực gọi server, telemetry/heartbeat/ACK và đọc asset mới. Chưa thử n8n + PostgreSQL trên Windows của Dương.

## PR

Title: feat(simulator): add connection presets and command evidence UI

Mô tả: Thêm cấu hình mẫu backend/flow01 có bước lưu rõ ràng; bảng trạng thái chuẩn bị demo và panel lệnh/ACK theo cùng command_id. Không thay engine. Phân biệt preview, HTTP thành công, thực thi thiết bị và xác nhận actual tại backend.
