# Dashboard: độ mới dữ liệu và phục hồi kết nối

Phạm vi PR: frontend hiển thị sáu thông số hiện có, phân biệt mẫu mới/cũ và giữ kết quả thành công khi từng API gặp lỗi. Đây là một phần nhỏ thuộc nhiệm vụ frontend của Dương; chưa hoàn thành WF07, WF08, WF09 hay toàn bộ phân công.

## Luồng dữ liệu để giải thích khi demo

Simulator gửi telemetry → backend lưu PostgreSQL → GET /api/dashboard đọc mẫu mới nhất → Next.js proxy → Dashboard hiển thị. Chỉ sửa giá trị trong một node n8n mà không lưu telemetry qua API sẽ không đổi dữ liệu dashboard.

- `last_seen`: heartbeat gần nhất, dùng kiểm tra thiết bị còn liên lạc.
- `observed_at`: thời điểm đo của mẫu cảm biến, dùng đánh giá độ mới của số liệu.
- `updatedAt` trong frontend: thời điểm trang đọc API thành công; đọc thành công không đồng nghĩa vừa có mẫu đo mới.
- Trên 30 giây: gắn nhãn dữ liệu cũ. Đây là quy tắc hiển thị đã có ở bản nền, không phải ngưỡng nhiệt độ/độ ẩm của WF07 và không tạo lệnh điều khiển.
- Giá trị 0 là dữ liệu hợp lệ, ví dụ 0 người. Thiếu dữ liệu hiển thị `—`.
- Số PostgreSQL dạng chuỗi được định dạng cùng cách với kiểu number.
- Thời gian mẫu không hợp lệ hoặc đi trước đồng hồ máy trên 5 giây: yêu cầu kiểm tra đồng hồ, không gắn nhãn mới. Cần đồng bộ đồng hồ khi demo.

## Các file chính

| File | Vai trò |
| --- | --- |
| frontend/lib/dashboard.ts | Kiểu dữ liệu, định dạng số/thời gian, quy tắc mẫu mới/cũ |
| frontend/components/RoomReadings.tsx | Sáu thông số và đồng hồ cập nhật độ mới mỗi giây |
| frontend/lib/dashboard-sync.ts | Đọc API với timeout; giữ giá trị thành công khi lỗi |
| frontend/components/useDashboard.ts | Vòng đọc API: đợi xong đợt hiện tại rồi nghỉ 4 giây; hủy request khi rời trang |
| frontend/components/Dashboard.tsx | Ghép giao diện, thông báo riêng dashboard/danh sách lệnh |

API dashboard và commands được đọc song song, mỗi kết quả được hiển thị ngay khi hoàn tất. Lỗi một API không chặn kết quả API còn lại. Timeout mỗi request 12 giây ở trình duyệt; proxy hiện có timeout 10 giây. Nút Làm mới dùng cùng vòng đọc, không tạo thêm đợt chồng lặp. Giá trị cũ giữ trong bộ nhớ trang; tải lại cả trang khi backend đang tắt sẽ không có dữ liệu để giữ.

## Kiểm tra tự động

Chạy từ gốc repository, sau `npm run install:all`:

```powershell
npm test --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

11 bài kiểm tra: số 0/thiếu/sai, số numeric dạng chuỗi, ranh giới 30 giây, ngày sai/tương lai, lỗi API từng phần theo cả hai hướng, kết quả nhanh không chờ kết quả chậm, giữ dữ liệu/thời điểm cũ rồi phục hồi, timeout, JSON lỗi, hủy request khi rời trang.

Test dùng Node có hỗ trợ `--experimental-strip-types` (Node 22.16 của Dương dùng được); không thêm dependency. Có thể thấy cảnh báo experimental/module detection trên Node 22; xem tổng số pass/fail. Lệnh `npm test` tại gốc vẫn là test backend/simulator của bản nền; test frontend dùng lệnh riêng ở trên.

## Nghiệm thu local bắt buộc trước khi nhờ Khoa merge

Khởi động Docker Desktop, PostgreSQL, backend, frontend và simulator theo README. Dùng mode HTTP với các URL backend được `npm run setup` tạo. Chưa cần n8n để thử phần dashboard này.

| Bài thử | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| Giá trị thật | Simulator: tắt Dao động nhẹ, nhập nhiệt độ 28.5, độ ẩm 60, CO2 800, số người 3, độ sáng 70, công suất 150; Áp dụng giá trị rồi Gửi một mẫu | Dashboard hiển thị các số tương ứng, thời điểm mẫu thay đổi |
| Số 0 | Đổi số người thành 0; Áp dụng giá trị rồi Gửi một mẫu | Số người hiện 0, không phải dấu — |
| Mẫu cũ nhưng vẫn online | Bấm Tạm dừng trên simulator; chờ hơn 30 giây | Giá trị giữ nguyên, nhãn Dữ liệu cũ; heartbeat vẫn chạy nên thiết bị có thể vẫn Online |
| Có mẫu mới trở lại | Bấm Bắt đầu | Mẫu mới xuất hiện; nhãn về Dữ liệu mới |
| Backend tắt | Sau khi đã có số liệu, Ctrl+C ở terminal backend; giữ nguyên trang frontend | Hiện lỗi kết nối, giữ số liệu cũ; không tự biến số liệu thành 0 |
| Backend phục hồi | Chạy lại npm run dev:backend | Trang tự đọc được dữ liệu, lỗi biến mất khi từng API phục hồi |
| API lệnh lỗi riêng | Chrome/Edge DevTools → Network request blocking, chặn `*api/backend/commands` rồi gửi mẫu mới | Có cảnh báo ở Lệnh gần đây; số cảm biến vẫn cập nhật. Bỏ chặn sau thử |
| Giao diện hẹp | Thu chiều rộng cửa sổ hoặc bật chế độ điện thoại | Nhãn/trạng thái/số liệu đọc được, bảng lệnh cuộn ngang khi cần |

Đóng tab simulator không dừng worker Node. Muốn tạo mẫu cũ hãy dùng Tạm dừng. Không sửa heartbeat thành telemetry hoặc đổi API để ép thiết bị online.

Khi chưa cấu hình flow03, nút điều khiển thủ công bị khóa là hành vi bản nền. PR này không bật giả nút điều khiển, không tự đổi actual trước ACK. Có thể chạy `npm run smoke` để kiểm tra queue/ACK nền; PASS không chứng minh các workflow đã hoàn thiện.

## Bằng chứng bàn giao

Chụp dashboard có mẫu mới, có mẫu cũ, backend tắt rồi chạy lại; chụp terminal test/build. Ghi kết quả local thực tế vào mô tả PR. Trên môi trường chuẩn bị gói đã đạt 11/11 test và production build frontend. Chưa nghiệm thu Docker PostgreSQL trên máy Windows của Dương.

Không thêm module hay bảng backend trong PR này; dùng nguyên các API hiện có. Nhờ Khoa review UI và Vinh đối chiếu contract numeric/timestamps nếu API thay đổi.

## Mẫu mô tả PR — cập nhật các ô theo kết quả thực tế

### Vì sao

Dashboard cần cho người xem biết số liệu có còn mới không. Trước đây lỗi API danh sách lệnh có thể khiến kết quả dashboard thành công cũng không được cập nhật.

### Thay đổi

- Tách hiển thị sáu thông số; nhận số và chuỗi numeric, giữ giá trị 0.
- Phân biệt thời điểm mẫu đo, heartbeat và lần đọc API thành công.
- Gắn nhãn mẫu cũ sau 30 giây kể cả khi API lỗi.
- Đọc hai API độc lập, giữ kết quả thành công và tự phục hồi.
- Thêm timeout, hủy request khi rời trang và 11 bài kiểm tra.

### Kiểm tra trên máy Dương

- [ ] `npm test --prefix frontend`: 11 pass.
- [ ] `npm run build --prefix frontend`: thành công.
- [ ] Simulator gửi dữ liệu → frontend đổi số.
- [ ] Tạm dừng telemetry → nhãn cũ; bật lại → nhãn mới.
- [ ] Backend tắt/mở lại → giữ số cũ và phục hồi.
- [ ] Lỗi API commands không chặn số liệu dashboard.

Phạm vi: chỉ dashboard frontend; không thêm bảng/module backend, chưa bao gồm WF07–09, biểu đồ và manual override UI hoàn chỉnh.
