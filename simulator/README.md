# Classroom Lab — Smart Classroom Simulator

Project hoàn chỉnh để chạy **local trước**, tạo dữ liệu giả cho n8n và mô phỏng thiết bị nhận lệnh. Giao diện sáng, tiếng Việt, không dùng thư viện giao diện/CDN, không cần Wokwi hoặc mạch thật.

## 1. Chạy ngay trên Windows

Cần Node.js **22.9 trở lên**. Giải nén ZIP, mở terminal trong thư mục có `package.json`:

```powershell
node -v
Copy-Item .env.example .env
npm start
```

Có thể nhấp đúp `START_WINDOWS.bat` để chạy thay cho các lệnh trên.

Mở **http://localhost:4310**. Không cần `npm install` vì project chỉ dùng module tích hợp của Node.js. Cổng 4310 để không trùng frontend 3000, backend 3001 hoặc n8n 5678.

Lần đầu đang ở chế độ **Xem trước**. Thử:

1. Chọn kịch bản “Phòng nóng, có người”.
2. Bấm “Gửi một mẫu”; xem JSON và biểu đồ.
3. Bấm “Bắt đầu” để phát định kỳ; “Tạm dừng” chỉ ngừng telemetry.
4. Trong “Thiết bị mô phỏng”, bấm “Thử bật” để kiểm tra thiết bị/ACK nội bộ. Nút này chỉ có trong chế độ xem trước.
5. Vào “Nhật ký sự kiện” để xem từng payload.

Đóng tab không dừng bộ phát. Dừng bằng nút Dừng hoặc Ctrl+C trong terminal. Mở lại ứng dụng luôn ở STOPPED; không tự gửi dữ liệu sau restart.

Linux/macOS: thay `Copy-Item .env.example .env` bằng `cp .env.example .env`.

## 2. Có gì trong bản này?

- 8 cảm biến số: nhiệt độ, độ ẩm, độ sáng, số người, CO₂, công suất, PM2.5, lưu lượng nước; thêm trạng thái cửa.
- Chỉnh số trực tiếp hoặc kéo thanh trượt; áp dụng bộ giá trị; dao động nhẹ nhiệt/ẩm tùy chọn.
- 8 kịch bản tĩnh + timeline 90 giây: lớp học bình thường → nóng/đông → phòng trống.
- Gửi một mẫu, tự động gửi, pause/stop, gửi lại cùng `event_id`.
- HTTP telemetry, heartbeat, ACK; nhận lệnh push hoặc lấy lệnh qua claim API tùy chọn.
- FAN, LIGHT, VENTILATION, DEHUMIDIFIER với ON/OFF.
- Thực thi lệnh, hiển thị actual state, trả SUCCESS/FAILED; chống thực thi trùng trong tiến trình hiện tại.
- Giả lập offline, mất ACK, lỗi thiết bị; từ chối lệnh hết hạn hoặc sequence cũ.
- Log tối đa 150 sự kiện, lọc/tìm kiếm và tải JSON; đồ thị 40 mẫu.
- Cấu hình lưu tại `data/config.json`; secret chỉ đọc từ `.env`.

**Không bao gồm:** AI/rule tự động bật tắt, backend NestJS của nhóm, database nghiệp vụ hoặc 12 workflow. Những phần đó vẫn do hệ thống n8n/backend xử lý. Đây là phần mềm giả lập độc lập, không phải bản thay thế toàn bộ hệ thống.

## 3. Kiến trúc chạy local

```text
Giao diện web (4310)
  → API nội bộ Node.js → Simulator engine chạy nền trong cùng tiến trình
  → POST telemetry / heartbeat tới n8n
n8n hoặc backend
  → POST /api/commands → engine thực thi giả → POST ACK tới n8n
Hoặc engine → POST claim URL của backend → nhận command → thực thi → ACK
```

Giao diện dùng HTML/CSS/JavaScript thuần; server dùng Node.js ES Modules. Phần mềm này được tách khỏi frontend Next.js hiện tại để chạy thử độc lập. Khi tích hợp, giữ engine/worker và chuyển UI vào route `/simulator` của Next.js nếu nhóm muốn. Bộ phát hiện chạy bằng timer phía Node, không nằm trong trình duyệt. Chưa tách process worker riêng; nếu cần scale/host dài hạn có thể tách sau.

## 4. Kiểm tra gửi HTTP khi chưa sửa n8n

Mở terminal thứ hai trong thư mục project:

```powershell
npm run demo:receiver
```

Trên web → **Kết nối n8n** → **Điền cấu hình receiver thử nghiệm** → **Lưu cấu hình**. Bấm Gửi một mẫu, xem terminal thứ hai nhận JSON. Receiver cổng 4311 chỉ ghi log, **không phải n8n, không tự ra quyết định**. HTTP thành công chứng minh request tới receiver, chưa chứng minh tích hợp n8n.

Thử một lệnh thật qua HTTP bằng PowerShell (simulator mặc định ESP32_A101):

```powershell
$command = @{
  command_id = [guid]::NewGuid().ToString()
  device_id = "ESP32_A101"
  command_type = "FAN"
  action = "ON"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:4310/api/commands" -ContentType "application/json" -Body $command
```

Quạt trên UI đổi ON; ACK xuất hiện tại receiver. Đổi action thành OFF, dùng command_id mới để tắt. Nếu đặt COMMAND_TOKEN thì thêm `-Headers @{Authorization="Bearer <token>"}`. Endpoint `/api/local-command` chỉ để UI thử trong preview, không dùng làm endpoint tích hợp.

## 5. Kết nối n8n thực tế

### 5.1 Telemetry — flow 01

1. Mở flow 01 hoặc tạo bản sao để chuyển đổi an toàn.
2. Thêm Webhook, method POST, path ví dụ `simulator-telemetry`. Không nối HTTP trực tiếp vào MQTT Trigger.
3. Dữ liệu webhook nằm ở `$json.body`. Nếu node chuẩn hóa cũ đọc `$json.temperature`, thêm Edit Fields/Code chuyển body thành item gốc. Code node dạng Run Once for All Items:

```javascript
return $input.all().map(item => ({ json: item.json.body }));
```

4. Nối sang logic kiểm tra/lưu/ra quyết định hiện có. Lưu ý schema v2 có thêm trường, không tự tương thích mọi DTO cũ.
5. Publish workflow rồi copy **Production URL thực tế** vào Telemetry webhook của simulator.
6. Chọn HTTP, lưu cấu hình, gửi một mẫu rồi kiểm tra **Executions** của flow 01.

Ví dụ local: `http://localhost:5678/webhook/simulator-telemetry`. Test URL `/webhook-test/...` chỉ dùng khi n8n đang Listen for test event. Tên path trong README là đề xuất, **chưa được tạo sẵn trong n8n của bạn**.

### 5.2 Heartbeat — flow 06; ACK — flow 05

Tương tự, thêm Webhook POST vào flow 06 và 05, map `$json.body`, nối logic hiện có. Copy URL vào đúng ô Heartbeat và ACK. Không cần tạo thêm workflow nghiệp vụ chỉ vì thêm đầu vào HTTP.

Payload ACK có `status: SUCCESS|FAILED` như ESP32 trước đây, kèm `result`, `actual_state`, `fan_state`, `light_state`. Nếu backend dùng trạng thái `ACK` cho lệnh thành công, **flow 05 phải ánh xạ SUCCESS → ACK**. Không đổi giả status trong simulator chỉ để khớp database.

### 5.3 Chuyển lệnh — flow 04

Đầu ra flow 04 cho adapter simulator dùng HTTP Request:

- Method: POST.
- URL: `http://localhost:4310/api/commands` khi n8n chạy trực tiếp cùng máy.
- Nếu n8n chạy Docker Desktop: dùng `http://host.docker.internal:4310/api/commands`; đặt `HOST=0.0.0.0` trong `.env` và restart simulator để container truy cập được.
- Body Content Type: JSON.
- Body tối thiểu: command_id, device_id (hoặc device_code), command_type, action.
- Nếu đặt COMMAND_TOKEN: header `Authorization: Bearer <token>`.

Ví dụ JSON gửi đi:

```json
{
  "command_id": "c735b502-457b-40e5-af56-16452d644379",
  "device_id": "ESP32_A101",
  "command_type": "FAN",
  "action": "ON",
  "sequence": 1,
  "expires_at": "2099-01-01T00:00:00.000Z"
}
```

`expires_at` ví dụ chỉ minh họa schema; trong thực tế backend cấp TTL ngắn phù hợp. `sequence` do backend tăng đơn điệu cho từng thiết bị/loại cơ cấu chấp hành, không lấy từ sequence telemetry.

Nếu thiết bị trong database dùng UUID: điền UUID đó vào ô Device UUID; giữ device_code là ESP32_A101. Khi đó telemetry/heartbeat mang UUID ở device_id. Các flow cũ tra thiết bị bằng mã phải chuyển sang device_code hoặc adapter tương ứng.

Flow 04 không được đánh dấu thiết bị đã thực thi chỉ vì request gửi thành công; flow 05 nhận ACK mới xác nhận. Simulator chấp nhận cả wrapper cũ có `mqtt_payload` là chuỗi JSON, nhưng cấu trúc trực tiếp ở trên dễ kiểm tra hơn.

### 5.4 Nhận lệnh bằng claim API (tùy chọn)

Để trống Claim URL nếu đã dùng push từ flow 04. Chỉ chọn một đường chính để demo dễ theo dõi. Nếu dùng claim, API backend phải thực hiện nhận lệnh **nguyên tử** và trả đúng contract tại `docs/API.md`; không có sẵn API đó trong simulator. Poll hoạt động khi RUNNING hoặc PAUSED. Đường push vẫn nhận khi STOPPED, miễn không bật lỗi offline.

## 6. Ý nghĩa dữ liệu và giới hạn

- `occupancy = occupancy_count > 0`; không có hai nút độc lập gây mâu thuẫn.
- `light_percent`: 0 tối, 100 sáng. `light_raw = round((100 - light_percent) * 4095 / 100)` là quy ước tương thích mô phỏng, không phải phép đo lux thực.
- Công suất và lưu lượng là giá trị **do người dùng/kịch bản nhập**. Bật quạt không tự đổi công suất; simulator không mô phỏng vật lý nhiệt/điện. n8n/backend tính kWh từ power_w và thời gian nếu cần.
- PM2.5 và nước là trường mở rộng; hiện gửi được nhưng flow phía nhóm phải bổ sung xử lý nếu muốn dùng.
- Cửa mở không tự đồng nghĩa “ngoài giờ”; n8n cần đối chiếu lịch và múi giờ.
- Timestamp ISO UTC; giao diện log theo giờ máy. Định lịch nghiệp vụ ở n8n theo Asia/Ho_Chi_Minh.
- Preview chỉ tạo/log và thử thiết bị nội bộ. Bộ đếm HTTP không tăng trong preview.
- HTTP retry tối đa 2 lần/request với ID không đổi khi lỗi mạng, 429 hoặc 5xx. Lỗi 4xx khác không retry. Không có hàng đợi telemetry bền vững; gửi thất bại được log rồi chuyển mẫu tiếp theo.
- ACK lỗi gửi có tối đa 3 vòng, cách nhau ít nhất 5 giây; mỗi vòng dùng cơ chế gửi trên. Khi hết vòng, log lỗi. Gửi lại command cùng ID trong phiên hiện tại sẽ trả lại ACK cũ.
- “Không trả ACK” cố ý bỏ ACK mới; ACK đã nằm trong hàng chờ trước khi bật tùy chọn vẫn có thể hoàn tất.
- Dừng/pause không hủy HTTP đã bay đi; request đang chạy có thể hoàn tất sau thao tác.
- Cache tối đa 1.000 command trong RAM, log/actual state/run không tồn tại qua restart. Backend cần lưu idempotency bền vững. Cấu hình cảm biến và kết nối có lưu, trạng thái RUNNING không lưu.
- Timeline: tự start khi chọn; sau 90s kết thúc chuyển cảnh, vẫn phát các giá trị cuối. Pause/Stop hủy timeline đang chạy; chọn lại kịch bản để bắt đầu lại.

## 7. Kịch bản demo đề xuất

| Bước | Thao tác | Điều cần quan sát |
|---|---|---|
| 1 | Bình thường, gửi một mẫu | Flow 01 nhận đủ trường; DB có telemetry |
| 2 | Nóng có người | Flow 02/03 quyết định; 04 gửi lệnh; UI FAN ON; 05 nhận ACK |
| 3 | Phòng trống | Policy tiết kiệm tạo OFF; UI FAN OFF sau lệnh |
| 4 | Độ ẩm cao / CO₂ cao | Flow 07 có đề xuất và thiết bị tương ứng đổi trạng thái |
| 5 | Gửi lại event_id | Flow 01/backend không tạo telemetry/lệnh trùng |
| 6 | Bật “Không trả ACK”, tạo command mới | Thiết bị đổi trạng thái nhưng backend timeout theo TTL |
| 7 | Bật offline, đợi ngưỡng | Flow 06 phát hiện stale heartbeat |
| 8 | Tắt lỗi, gửi lại dữ liệu | Hệ thống ghi nhận hồi phục |

Kết quả rule/AI phụ thuộc workflow nhóm đã triển khai; simulator không giả vờ thực hiện các bước đó.

## 8. File và cách phát triển

```text
src/model.js            Schema, giá trị mặc định, kịch bản
src/engine.js           Bộ phát, timer, HTTP, nhận command, ACK
src/server.js           HTTP server, API UI, lưu config
src/demo-receiver.js    Receiver HTTP thử nghiệm riêng
public/index.html      Giao diện tiếng Việt
public/styles.css      Theme sáng, responsive
public/app.js          UI, gọi API, log, biểu đồ
tests/engine.test.js    Kiểm thử logic thực thi
tests/http.test.js      Kiểm thử HTTP tích hợp
docs/API.md            Contract tích hợp
```

`npm run dev` để Node tự restart khi sửa source; mỗi restart dừng phiên và xóa state trong RAM. `npm test` chạy kiểm thử tự động. Bản bàn giao đã kiểm tra bằng Node 24 trong môi trường xây dựng; máy bạn cần chạy lại `npm test` sau giải nén.

## 9. Local trước, host sau

Mặc định chỉ nghe 127.0.0.1. Đây là ứng dụng công cụ local, **chưa có tài khoản và phân quyền cho giao diện/API quản trị**. Nếu bind 0.0.0.0 để n8n Docker gọi, chỉ dùng mạng thử nghiệm tin cậy, đặt COMMAND_TOKEN và không mở cổng công khai. COMMAND_TOKEN chỉ bảo vệ `/api/commands`, không thay thế đăng nhập cho toàn ứng dụng.

Khi đưa lên host cần gateway xác thực toàn bộ UI/API, HTTPS, cấu hình quyền, volume data và worker hoạt động liên tục. File Docker có sẵn để đóng gói; chưa thực hiện deploy. Có thể chạy `docker compose up --build -d`, xem log bằng `docker compose logs -f`, dừng bằng `docker compose down`. Compose chỉ mở cổng ở loopback của máy host. Khi simulator nằm trong container, URL `localhost:5678` không trỏ về n8n trên máy host; trên Docker Desktop dùng `host.docker.internal:5678` hoặc tên service trong cùng Docker network. Không chạy timer liên tục trong serverless handler. `.env` và `data/` không commit.

## 10. Xử lý lỗi thường gặp

- `fetch failed`/ECONNREFUSED: kiểm tra n8n đã chạy, port, URL và localhost đang chỉ máy/container nào.
- HTTP 404 ở n8n: sai path hoặc chưa Publish Production webhook.
- HTTP 401: sai OUTBOUND_TOKEN/header credential.
- Có HTTP 200 nhưng flow lỗi: xem Executions, body mapping, schema và endpoint backend; HTTP 200 không chứng minh toàn flow thành công.
- Lệnh thành công nhưng UI không đổi: kiểm tra đang nhìn đúng phòng/device; xem log command, action, expiry, sequence, fault.
- Không lưu cấu hình được vì đang gửi: đợi request hoàn tất; có thể Dừng trước khi sửa kết nối.
- Muốn về mặc định: Ctrl+C, đổi tên/xóa `data/config.json`, chạy lại. Việc này chỉ reset simulator, không xóa DB của nhóm.
- `--env-file-if-exists` không được nhận: dùng Node >=22.9.

Tài liệu nền: [Node.js fetch](https://nodejs.org/api/globals.html#fetch), [Node.js test runner](https://nodejs.org/api/test.html). Project không phụ thuộc npm package bên ngoài.
