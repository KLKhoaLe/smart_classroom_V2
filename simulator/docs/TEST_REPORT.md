# Kiểm tra bản bàn giao

- Runtime kiểm thử: Node.js 24.19.0 trên Linux.
- Lệnh: `npm test`.
- Kết quả: 11/11 test đạt.
- Kiểm tra logic: schema/occupancy/ánh sáng, bản tin trùng, command trùng hoặc sai nội dung, command cũ/hết hạn/sai thiết bị, offline/FAILED/drop ACK, retry HTTP giữ nguyên ID, chống gửi chồng, pause/restart run, claim, validation.
- Kiểm tra tích hợp HTTP thật: khởi động server riêng, phục vụ HTML/CSS/JS, gửi telemetry + heartbeat tới receiver, nhận command có token, gửi ACK về receiver, kiểm tra state, chặn Origin khác, lưu config và khởi động lại ở STOPPED.
- Kiểm tra cú pháp JavaScript bằng `node --check`.

Chưa kết nối n8n/backend thật của nhóm; cần cấu hình URL và chuyển đầu vào flow theo README. Receiver thử nghiệm không phải n8n.

Kiểm tra trình duyệt tự động chưa thực hiện được vì môi trường xây dựng không tải được Chromium. Không coi kiểm tra phục vụ HTML/CSS/JS là kiểm tra hiển thị giao diện. Cần mở app trên Chrome/Edge máy người dùng để kiểm tra giao diện và thao tác cuối cùng. Giao diện có CSS responsive desktop/mobile nhưng chưa nghiệm thu trực quan trên trình duyệt ở môi trường xây dựng.
