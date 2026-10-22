# Dương — tiếp tục sau commit frontend mới nhất

Gói này có 3 JSON n8n và API bổ sung chạy thật trên local. API thuộc đề xuất mới cần Khoa/Vinh review. WF03 chưa nhận proposal; WF10 chưa nhận event. Không đánh dấu toàn bộ phần Dương hoàn thành sau khi chỉ chạy gói này.

Không dùng lại ZIP Import chỉ có logic mẫu đã gửi trước đó. Không import đè workflow cũ, WF01–03 hoặc workflow của thành viên khác. Chỉ làm trên nhánh riêng; ba commit cùng một nhánh.

## 1. Chuẩn bị đúng thư mục và nhánh

Mở Docker Desktop. Trong VS Code mở C:\Users\LENOVO\smart_classroom_V2. Terminal → New Terminal, chọn PowerShell.

```powershell
cd C:\Users\LENOVO\smart_classroom_V2
git status
```

Nếu status còn file sửa/chưa commit hoặc có conflict: dừng tại đây và gửi kết quả; không reset, restore hay xóa file để ép sạch. Khi working tree clean, chạy:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/duong-monitoring-v2
```

Nếu Git báo nhánh đã tồn tại, dùng `git switch feat/duong-monitoring-v2`. Nếu pull báo lỗi, dừng và gửi nguyên lỗi; không dùng force.

## 2. Giải nén và đưa code vào dự án

Tải Duong_WF07_09_Local_Review.zip. Extract All vào:

`C:\Users\LENOVO\Downloads\Duong_WF07_09_Local_Review`

Trong thư mục đó phải thấy Install.ps1, manifest.json, HUONG_DAN_TU_DAU.md và thư mục files. Ba JSON nằm trong files/n8n-workflows. Installer chỉ thêm file mới và thêm một import/module vào AppModule; không thay frontend hoặc workflow 01–03. Nếu file mới cùng tên đã có nội dung khác, installer dừng để tránh ghi đè.

Chạy trong terminal VS Code:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\Duong_WF07_09_Local_Review\Install.ps1" -Repo "C:\Users\LENOVO\smart_classroom_V2"
git diff --stat
git status --short
```

ExecutionPolicy ở lệnh trên chỉ áp dụng tiến trình đang chạy script, không đổi cấu hình toàn máy. Gói không chứa credential, không tự commit/push, không tự sửa database.

## 3. Build, kiểm thử và chuẩn bị database

Nếu backend đang chạy, Ctrl+C tại đúng terminal backend trước khi migrate. Giữ các terminal khác nguyên trạng.

```powershell
npm ci --prefix backend
npm test --prefix backend
node --test n8n-workflows/duong/workflows.test.cjs
npm run db:up
npm run db:migrate
npm run db:seed
```

Kỳ vọng kiểm tra trên bản ZIP gốc: backend 15/15, kiểm tra JSON 1/1. Nếu nhóm thêm test sau này tổng số có thể tăng; tất cả vẫn phải pass. Các test SQL dùng PGlite trong bộ nhớ, không sửa database Docker của bạn.

Tạo cấu hình DEMO A101 và lịch demo lần đầu:

```powershell
cd backend
npx ts-node src/modules/duong-monitoring/setup.ts
cd ..
```

Script tạo settings nếu chưa có; chỉ thêm lịch 08:00–17:00 tất cả các ngày khi phòng chưa có lịch. Không ghi đè cấu hình cũ. Ngưỡng vắng lấy policy: seed hiện tại là 30 giây, không phải 120 giây của V1. WF07 mặc định giữ bất thường 20s, hồi phục 10s; WF09 hồi phục 20s.

## 4. Chạy backend và n8n

Terminal backend:

```powershell
npm run dev:backend
```

Mở http://localhost:3001/api/health. Backend gọi từ Docker cần HOST=0.0.0.0 trong backend/.env rồi restart backend. Không gửi nội dung .env lên GitHub.

Terminal mới, kiểm tra n8n:

```powershell
docker ps -a --filter "name=n8n"
```

Có n8n đang chạy: mở http://localhost:5678. Có n8n ở trạng thái Exited: `docker start n8n`. Chỉ khi không có container n8n, dùng lệnh bạn đang dùng:

```powershell
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Giữ terminal đó mở. Volume n8n_data giữ dữ liệu n8n. Chưa cần frontend/simulator cho bài thử có script ở bước 6.

## 5. Import ba workflow

Trong n8n → New workflow → dấu … → Import from File. Lần lượt tạo ba workflow riêng, chọn từ thư mục dự án:

1. n8n-workflows/07_ENVIRONMENT_ALERT_V2_DUONG.json
2. n8n-workflows/08_OCCUPANCY_ENERGY_V2_DUONG.json
3. n8n-workflows/09_AFTER_HOURS_SECURITY_V2_DUONG.json

Mỗi lần phải tạo workflow trống mới. Save nếu có nút Save. Node Cau hinh có backend_base_url mặc định http://host.docker.internal:3001/api cho n8n Docker gọi backend Windows.

Nếu backend có API_TOKEN, chọn Header Auth trong 3 HTTP Request node của MỖI workflow: Doc telemetry moi nhat, Doc policy lich va trang thai, Luu ket qua nguyen tu. Header Authorization, value Bearer rồi token của bạn. Chọn credential đã tạo, không dán token vào code/export.

Gmail tắt mặc định cả bằng email_enabled=false và node disabled. Giữ nguyên để thử logic trước. Publish/Activate cả ba workflow để script gọi production webhook. Manual Trigger không cần Publish, nhưng cần mẫu telemetry mới trong 30s.

Production webhook của ba workflow:

- http://localhost:5678/webhook/duong-monitoring-07
- http://localhost:5678/webhook/duong-monitoring-08
- http://localhost:5678/webhook/duong-monitoring-09

Tab Test URL/Production URL chỉ để xem/copy. Việc giao diện quay về tab Test không đổi endpoint script. Nếu 404: kiểm tra Published/Active, đúng path và không trùng webhook với workflow khác. Chỉ dùng webhook không xác thực trong demo local; trước public phải cấu hình authentication.

## 6. Thử từng chức năng bằng dữ liệu thật được lưu

Stop simulator đang phát cho ESP32_A101 trong lúc thử, để không lẫn nhiều nguồn mẫu. Các script dưới đây tự tạo telemetry có simulated=true, lưu bằng API thật, rồi gọi workflow n8n bằng telemetry_id thật. Không cần tự viết JSON hay sửa thời gian hệ thống.

Nếu API_TOKEN bật, đặt `$env:API_TOKEN` trong terminal của script bằng giá trị local của bạn; không ghi vào file Git. Nếu webhook n8n đã dùng xác thực Bearer, đặt `$env:N8N_DEMO_TOKEN` tương ứng. Cấu hình header khác thì cần điều chỉnh script cùng contract; đừng tắt xác thực hệ thống đang public để chạy demo.

### WF07

```powershell
node n8n-workflows/duong/demo.cjs --case environment
```

Chờ khoảng 50 giây, không Ctrl+C. Mỗi 10s gửi một mẫu:

- Mẫu 0–3: nhiệt 38°C, ẩm 85%, CO₂ 1800 ppm. Ban đầu chờ; từ khi đủ 20s có proposal FAN/DEHUMIDIFIER/VENTILATION ON và ba event.
- Những mẫu tiếp theo còn bất thường: không tạo event OPEN lặp.
- Mẫu 4–5: nhiệt 27, ẩm 50, CO₂ 600. Sau thời gian hồi phục 10s, thu hồi proposal và tạo event recovered.

Mở n8n → workflow 07 → Executions → execution tương ứng → Luu ket qua nguyen tu → OUTPUT JSON. `created:true` và `integration.state_saved:true` chứng minh API đã lưu; `flow03_connected:false` và `wf10_connected:false` là giới hạn thực tế, không phải lỗi cần sửa bằng đổi thành true.

### WF08

```powershell
node n8n-workflows/duong/demo.cjs --case energy
```

Chờ khoảng 60s. Mẫu đầu có người, sau đó vắng, công suất 600W. Khi vắng đủ empty_delay_seconds của policy sẽ có proposal FAN/LIGHT OFF và EMPTY_HIGH_POWER event. Sau đó có người trở lại thì proposal tiết kiệm kết thúc, event hồi phục sau 10s.

`WAITING_EMPTY`: WF08 chưa đề nghị tắt, không có nghĩa thiết bị chắc chắn đang bật. kWh tăng theo khoảng thời gian đo thực. Với 600W liên tục 10s, khoảng đó xấp xỉ 0.001667 kWh. Thời gian chạy thực có độ trễ nên không so bằng tuyệt đối đến chữ số cuối.

### WF09

```powershell
node n8n-workflows/duong/demo.cjs --case security
```

Khoảng 40s. Mẫu đầu mở cửa, không có người; sau đó đóng cửa, vẫn không có người. Nếu đang ngoài lịch thật 08:00–17:00, mở cửa tạo AFTER_HOURS_ACTIVITY; lặp không thêm OPEN; đóng cửa đủ 20s tạo RECOVERED. Nếu đang trong lịch, không có cảnh báo là đúng. Script không giả đồng hồ hoặc đổi lịch phòng để làm bài thử trông như đạt; bộ test tự động kiểm tra cả trong/ngoài giờ.

Cuối mỗi script gửi lại cùng telemetry_id: kỳ vọng created=false, new_events=[] và không cộng điện lần hai. Không spam Execute vì state mới nhất có thể bị thay bởi execution khác; nếu CONTEXT_CHANGED, chạy lại với mẫu mới.

### Xem dữ liệu đã lưu

Khi API_TOKEN trống, mở:

http://localhost:3001/api/duong-monitoring/status/ESP32_A101

Khi có token, dùng header trong PowerShell/Postman; trình duyệt mở trực tiếp có thể trả 401. State nằm ở states; event nằm ở events; proposal còn hạn nằm ở proposals. Sau bài thử có hồi phục, proposals rỗng là đúng. Muốn chụp proposal đang hiệu lực, xem execution ở mẫu bất thường đủ thời gian trước hồi phục.

Nếu dùng DBeaver: database của compose hiện tại, schema public, xem duong_monitoring_states, duong_monitoring_results, duong_monitoring_events và control_proposals. Không nhầm bảng events chờ xử lý với incidents đã tạo.

## 7. Bật Gmail bổ sung sau khi các bài thử đạt

Làm ở WF07 trước:

1. Mở node Cau hinh: đổi email_enabled:false thành true; điền email_to là email nhận của bạn.
2. Bật lại node Gui Gmail bo sung (nhấp phải node → Activate/Enable tùy giao diện), chọn Gmail credential của bạn.
3. Save rồi Publish lại nếu dùng webhook.
4. Chạy lại script environment sau lượt trước đã hồi phục. Cảnh báo mới sẽ gửi một email gộp các chỉ số; hồi phục gửi email tương ứng. Các mẫu vẫn cùng điều kiện không gửi lặp.
5. Xem node Ket qua email: SENT khi Gmail trả message id; FAILED_OR_UNCERTAIN khi không có xác nhận. Kiểm tra hộp thư nhận thật để nghiệm thu.

Không xóa credential cũ chỉ vì node chưa chọn đúng credential. Lỗi DNS/OAuth là lỗi gửi email cần xử lý riêng; state/proposal/event đã được lưu trước bước này. Chưa có retry email bền vững: nếu backend lưu xong rồi execution dừng trước Gmail, chạy lại cùng telemetry sẽ không gửi email. Event vẫn còn để bàn giao WF10; cần chốt bên gửi email chính thức với Hiệp.

## 8. Giải thích node khi demo

| Node | Vai trò |
|---|---|
| Chay thu thu cong | Bấm Execute để lấy mẫu mới nhất đã có trong DB |
| Nhan tu WF01 | Điểm nối workflow chính, nhận telemetry_id |
| Webhook demo local | Script gọi để thử workflow thật qua HTTP |
| Cau hinh | URL backend, flow, thiết bị demo, tùy chọn email |
| Co telemetry_id? | Đã có ID thì đọc context ngay; chưa có thì đọc mẫu mới nhất |
| Doc telemetry moi nhat / Chon telemetry da luu | Lấy bản ghi thật từ API cho nhánh Manual |
| Doc policy lich va trang thai | Lấy cấu hình, lịch, state bền vững và phiên bản context |
| Danh gia WF07/08/09 | Tính điều kiện, thời gian, đề xuất/sự kiện, kWh tùy flow |
| Luu ket qua nguyen tu | Backend kiểm tra rồi ghi tất cả hoặc không ghi gì nếu lỗi |
| Gui email bo sung? | Chỉ cho gửi khi bật email và có transition mới vừa lưu |
| Soan email / Gui Gmail bo sung | Tạo nội dung và gửi bằng credential local |
| Ket qua email / Dau ra ban giao | Trả kết quả thực tế, giữ rõ phần chưa tích hợp |

## 9. Ba commit trên cùng một nhánh

Không commit .env, credential, node_modules, dist hoặc n8n_data. Các node/email cấu hình trực tiếp trong n8n không tự cập nhật file Git. JSON trong gói để email tắt, không credential.

Sau khi chạy thử thành công, từ thư mục dự án:

```powershell
git add backend/src/app.module.ts backend/src/modules/duong-monitoring backend/src/database/migrations/1792600000000-DuongMonitoring.ts backend/tests/duong-monitoring.test.cjs
git add n8n-workflows/07_ENVIRONMENT_ALERT_V2_DUONG.json n8n-workflows/duong/build.cjs docs/DUONG_MONITORING_CONTRACT.md
git diff --cached --stat
git commit -m "feat(monitoring): add durable evaluation backend and WF07 environment alerts"
```

Commit 1 chứa nền dùng chung cho ba flow, test core và WF07. Đây là phần API/schema cần Vinh review.

```powershell
git add n8n-workflows/08_OCCUPANCY_ENERGY_V2_DUONG.json
git commit -m "feat(n8n): add WF08 vacancy and energy monitoring workflow"
git add n8n-workflows/09_AFTER_HOURS_SECURITY_V2_DUONG.json n8n-workflows/duong/demo.cjs n8n-workflows/duong/workflows.test.cjs docs/DUONG_MONITORING_LOCAL_TEST.md
git commit -m "feat(n8n): add WF09 security workflow and local demo checks"
git push -u origin feat/duong-monitoring-v2
```

Tạo một Draft Pull Request, base main, compare feat/duong-monitoring-v2. Nhờ Khoa review tích hợp và Vinh review API/schema. Không tự merge. Tên đề nghị: `feat: add WF07–09 monitoring and proposed persistence API`.

Mô tả PR cần ghi: 3 flow và API/state/proposal/events mới; đã thử gì trên máy bạn; chưa nối consumer WF03/WF10; email bổ sung nếu đã test thật; migration tạo bốn bảng mới. Không tick Gmail/n8n/ACK khi chưa có bằng chứng.

## 10. Việc còn lại để hoàn thành phân công

Chốt contract với nhóm, WF01 gọi 07–09, WF02/03 xử lý proposal, WF10 nhận event và lưu incident; nối dữ liệu năng lượng cho báo cáo; UI phản ánh giám sát; bổ sung yêu cầu frontend còn thiếu theo khả năng backend; chạy toàn chuỗi command/ACK. Xem docs/DUONG_MONITORING_CONTRACT.md để biết điểm nối cụ thể.

Chưa có các phần của nhóm vẫn có thể làm và bàn giao gói này; không thể gọi đó là đã hoàn thành tích hợp toàn hệ thống. Nếu nhóm gửi code API tương đương sau này, hợp nhất module theo contract review, không giữ hai bộ API trùng chức năng.
