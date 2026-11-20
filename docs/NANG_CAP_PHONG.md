# Tích hợp điều khiển phòng thích ứng

## Chép vào repo đang dùng

1. Giải nén gói thay đổi ở thư mục tạm. Chép các file theo đúng đường dẫn tính từ thư mục chứa `package.json` gốc. Nếu repo có chỉnh sửa riêng trong cùng file, đối chiếu trước khi ghi đè. Dùng `git status --short` và `git diff` để rà lại.
2. Giữ cấu hình và dữ liệu đang chạy. Bổ sung các biến WEATHER ở cuối `backend/.env.example` vào `backend/.env` hoặc môi trường của dịch vụ backend. Giá trị mặc định dùng tọa độ gần trung tâm Đà Nẵng. Các phòng của cùng bản triển khai dùng chung địa điểm ngoài trời.
3. Build lại backend và frontend hoặc khởi động lại dev server. Chạy `npm run db:migrate` nếu repo chưa áp dụng hết migration cũ (đặc biệt ActuatorLevels). Hai tính năng mới dùng cột mức thiết bị và JSON evidence hiện có.
4. Trong n8n, cập nhật nội dung **workflow hiện có** WF01 và WF02 từ hai JSON đi kèm, lưu và publish/activate lại. Giữ đúng một workflow cho mỗi webhook path. Chỉ chép JSON vào repo chưa cập nhật workflow đang chạy.
5. Đặt `BACKEND_BASE_URL` trong n8n thành URL backend mà n8n truy cập được (không có đuôi /api). Đặt `N8N_PUBLIC_URL` hoặc `WEBHOOK_URL` thành URL gốc n8n. WF01 dùng địa chỉ này để gọi WF02. Giữ các biến/token nội bộ như repo gốc. Dùng `FLOW03_DISPATCH_MODE=BACKEND` để demo theo luồng HTTP đã kiểm thử. Để demo hoàn toàn theo rule, đặt `AI_ENABLED=false` ở n8n. Khởi động lại dịch vụ sau khi sửa môi trường.
6. Simulator chạy chế độ HTTP. Telemetry trỏ tới webhook production `/webhook/simulator-telemetry` của WF01. Giữ claim tại `/api/commands/claim` của backend. Có thể dùng trực tiếp `/api/devices/heartbeat` và `/api/commands/ack` của backend. Giữ các workflow 03, 07, 08, 09 đang kết nối như bản gốc. Nếu chỉnh tay từ dashboard, đặt `N8N_AUTOMATION_WEBHOOK_URL` phía backend tới webhook WF03 `/webhook/master-automation-v3`.

Với **bản source đầy đủ ở thư mục mới**, dùng Node 22.9 trở lên và Docker cho PostgreSQL. Từ thư mục gốc chạy lần lượt `npm run setup`, `npm run install:all`, `npm run db:up`, `npm run db:migrate`, `npm run db:seed`. Mở ba terminal chạy `npm run dev:backend`, `npm run dev:frontend`, `npm run dev:simulator`. Dùng n8n đang có của bạn, hoặc import các workflow từ thư mục n8n-workflows vào instance mới và cấu hình các webhook như trên. Dashboard mặc định ở localhost cổng 3000, simulator ở cổng 4310.

## Chức năng và kịch bản demo

- **Quạt và đèn.** WF02 đọc chuỗi mẫu cùng phiên trong tối đa 2 phút. Xu hướng cần ít nhất 3 mẫu, trải dài ít nhất 20 giây và không có khoảng trống quá 20 giây. Trong phòng có người, khi nhiệt độ gần ngưỡng bật và tăng ít nhất 0,6 °C, quạt chuyển lên mức 3. Khi nhiệt độ có xu hướng giảm, hệ thống có thể hạ quạt đã bật về mức 1. Với đèn, mức đầu ra dựa trên độ thiếu sáng và xu hướng tối đi. Khi đèn đang bật, mỗi lần điều chỉnh chênh tối đa 20 điểm phần trăm so với mức đã xác nhận. Giới hạn thời gian giữa lệnh và ưu tiên chỉnh tay vẫn do WF03/backend xử lý.
- **Demo quạt và đèn.** Với policy mặc định, đặt chu kỳ đo 10 giây, giữ cùng phiên, có 4 người, ánh sáng 10% và tắt jitter. Lần lượt cho nhiệt độ 28,2 → 28,5 → 29 °C trong ít nhất 20 giây. Quan sát quyết định quạt 3/3 và mục tiêu đèn 80%. Để thấy đèn tăng từng bước, bắt đầu với đèn đang bật ở mức thấp đã có ACK, trả về AUTO và giữ phòng tối. Mức đề xuất xuất hiện ngay dưới cảm biến. Đối chiếu với “Mức đã xác nhận qua ACK” trong ô thiết bị.
- **Thời tiết thật.** Đặt `WEATHER_MODE=live`. Backend gọi Open-Meteo lấy điểm sương ngoài trời; WF02 tính điểm sương trong phòng từ nhiệt độ và độ ẩm. Khi có người, độ ẩm cần xử lý và CO₂ dưới ngưỡng bật thông gió, hệ thống chọn thông gió nếu điểm sương ngoài trời thấp hơn trong phòng ít nhất 3 °C. Nếu đang thông gió giảm ẩm, hệ thống duy trì đến khi chênh lệch xuống dưới 1 °C. Trường hợp còn lại chọn máy hút ẩm. Thiết kế giả định thông gió trao đổi khí với bên ngoài. Quy tắc CO₂ cao, độ ẩm tới hạn và phòng trống được ưu tiên. Khi dữ liệu ngoài trời lỗi hoặc quá 45 phút, hệ thống quay về quy tắc trong phòng. Backend lưu kết quả tối đa 10 phút, chờ tối đa 2,5 giây mỗi lần gọi.
- **Demo thời tiết lặp lại được.** Giữ phòng 29 °C, ẩm 80%, CO₂ 720 ppm và 4 người. Đặt `WEATHER_MODE=demo-dry` trong backend rồi khởi động lại backend: điểm sương ngoài trời 15 °C, hệ thống chọn thông gió. Đổi sang `demo-humid` và khởi động lại backend: điểm sương ngoài trời 28 °C, hệ thống chọn hút ẩm. Chờ bản tin mới, hết thời gian chờ giữa hai lệnh và ACK. Dashboard ghi rõ “Thời tiết mô phỏng”. Chuyển lại `live` sau demo.
- **Chạy lại kiểm thử tích hợp cục bộ.** Từ gốc chạy `npm test --prefix backend`, `npm test --prefix simulator`, `npm test --prefix frontend` và `npm run test:history --prefix frontend`. Test WF02 dùng mã Code node trong JSON, PostgreSQL nhúng PGlite và simulator HTTP. Có các ca thiếu thời tiết, thời tiết cũ, CO₂ cao, độ ẩm tới hạn và trạng thái sau ACK.

## Danh sách đường dẫn

### Thêm mới

- `backend/src/modules/automation/outdoor-weather.ts`
- `docs/NANG_CAP_PHONG.md`
- `frontend/components/RoomNavigation.tsx`

### Chỉnh sửa

- `backend/.env.example`
- `backend/src/modules/automation/automation.module.ts`
- `backend/tests/automation-v3.test.cjs`
- `backend/tests/incidents-reports.test.cjs`
- `frontend/app/globals.css`
- `frontend/app/history/history.css`
- `frontend/app/layout.tsx`
- `frontend/components/Dashboard.tsx`
- `frontend/components/Records.tsx`
- `frontend/lib/dashboard.ts`
- `n8n-workflows/01_SENSOR_DATA_INGESTION_V3.json`
- `n8n-workflows/02_AI_DECISION_ENGINE_V3.json`

### Xóa

Không có file hoặc thư mục phải xóa trong repo gốc.
