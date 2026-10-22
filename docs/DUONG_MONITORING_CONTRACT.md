# Hợp đồng đề xuất cho WF07–09

Trạng thái: bản triển khai local do Dương đề nghị nhóm review. Chưa được Khoa/Vinh/Hiệp thống nhất. Không thay thế API chung nếu các nhánh của nhóm đã có phần tương đương.

## Phần đã triển khai trong gói

- Ba JSON n8n có Manual Trigger, Execute Workflow Trigger và webhook demo local.
- Đọc telemetry đã lưu, policy hiện hành, lịch và state qua NestJS.
- WF07: nhiệt/ẩm/CO₂ vượt ngưỡng có thời gian duy trì; hồi phục từng chỉ số; tạo/thu hồi proposal và event.
- WF08: thời gian trống liên tục; đề xuất OFF FAN/LIGHT; event trống nhưng điện cao; kWh tích phân hình thang; tránh cộng trùng, không nội suy qua khoảng mất dữ liệu/run mới.
- WF09: door_open hoặc occupancy_count ngoài lịch; timezone phòng; transition OPEN/RECOVERED có thời gian hồi phục, không spam mỗi lần trigger.
- Lưu state, proposal, event và kết quả trong cùng transaction; kiểm tra context_hash chống ghi đè khi state/policy/lịch đã đổi; replay cùng telemetry trả created=false.
- Email bổ sung có sẵn, tắt mặc định. Chỉ chạy sau ghi DB, cho transition mới; lỗi gửi không rollback kết quả giám sát. Chưa có hàng đợi retry email tự động; sau mất response không thể khẳng định email chưa gửi. Cần kiểm tra hộp thư/execution trước khi gửi lại.

## API mới đề xuất, base /api

| Method | Path | Ý nghĩa |
|---|---|---|
| GET | /duong-monitoring/context/:flow/:telemetry_id | Lấy một telemetry thật, policy, settings, schedule, state và context_hash |
| POST | /duong-monitoring/commit | Nhận {flow, telemetry_id, context_hash, evaluation}; backend kiểm tra lại cùng bộ quy tắc rồi lưu nguyên tử |
| GET | /duong-monitoring/status/:device | Xem state, proposal còn hạn, 100 event mới nhất và trạng thái tích hợp |

flow là số 7/8/9. telemetry_id là UUID bản ghi đã tồn tại; device đầu vào status nhận UUID hoặc code. Telemetry cũ hơn 30s hoặc tương lai quá 5s bị từ chối. Cùng run sequence không tăng hoặc observed_at không tăng: IGNORED. Không dùng dữ liệu mẫu UUID giả để gọi API này.

API dùng LocalGuard hiện có: khi API_TOKEN được cấu hình, HTTP Request node dùng Header Auth Authorization: Bearer token. Credential cấu hình trong n8n, không ghi token vào JSON/Git. Cơ chế phân quyền production vẫn thuộc Vinh; không coi gói demo này là RBAC hoàn chỉnh.

Core evaluate nằm ở backend/src/modules/duong-monitoring/evaluate.ts, được build.cjs nhúng nguyên mã đã compile vào Code node n8n. n8n tính kết quả; backend tính lại để xác nhận cùng phiên bản và dữ liệu trước khi ghi. Backend không dispatch, gọi AI hoặc thay đổi actual_state.

## Persistence

Migration mới tạo riêng:

- duong_monitoring_settings: tham số bổ sung theo phòng.
- duong_monitoring_states: state/version/proposal_id theo device + flow.
- duong_monitoring_results: một kết quả theo flow + telemetry_id; WF08 lưu interval_kwh để tổng hợp không cộng lại tổng tích lũy.
- duong_monitoring_events: event đã lưu chờ WF10, event_key unique.

Proposal ghi vào bảng control_proposals hiện có, một proposal_id ổn định cho mỗi device + flow. Mẫu mới gia hạn/cập nhật; hồi phục hết điều kiện thì hết hạn ngay. Với WF07 một chỉ số hồi phục sẽ được bỏ khỏi desired_state, các chỉ số khác vẫn giữ. Không phát lệnh OFF chỉ vì WF07 hồi phục. Khi mất telemetry, proposal hết TTL, không tự đánh dấu sự cố đã hồi phục.

State, kWh và events còn sau restart. Khoảng không có mẫu/đổi run không được cộng điện hoặc dùng để chứng minh phòng trống liên tục. Điện năng là ước tính ở các khoảng quan sát có đủ hai đầu mẫu, chưa phải điện năng cả ngày. missing_seconds ghi thời gian giữa hai mẫu bị bỏ qua; không thể chứng minh đủ dữ liệu trước mẫu đầu tiên.

Schema mới không sửa migration cũ. Down migration xóa đúng proposal_id thuộc state của module và các bảng riêng; mất dữ liệu giám sát của module. Không rollback khi có dữ liệu cần giữ nếu chưa backup.

## Cấu hình demo có nhãn

Chạy setup.ts sau migrate/seed tạo settings A101 và lịch 08:00–17:00 cả tuần nếu phòng chưa có lịch. Không ghi đè settings/lịch đã có. Các ngưỡng temperature_on, humidity_on, co2_on và empty_delay_seconds vẫn đọc policy hiện hành. Seed V2 có empty_delay_seconds=30; không mặc định là 120s như V1.

Settings demo: environment_hold_seconds=20; recovery_seconds=10; security_recovery_seconds=20; max_gap_seconds=30; high_power_w=500; proposal_ttl_seconds=60; environment_priority=80; energy_priority=10. Priority này là đề xuất, cần Khoa chốt khi ghép ưu tiên với manual/AI. Các tham số thời gian là thời gian quan sát qua nhiều mẫu, không dùng Wait node giữ execution dài.

## Điểm nối cần nhóm review

1. Khoa: WF01 sau lưu telemetry mới gọi 07/08/09 với {telemetry_id}; đợi có giới hạn rồi chuyển context cho WF02. Cần quyết định retry/outbox khi ingestion lưu xong nhưng downstream lỗi; không chỉ gửi lại event_id vì WF01 đang bỏ qua bản trùng.
2. Vinh: review schema, endpoint, transaction và cách dùng device lock. Khi thay settings/policy/schedule cần giữ nguyên quy tắc version/context, tránh thay giữa lúc đọc/ghi mà bỏ kiểm tra.
3. Khoa: WF02/03 phải lấy proposal còn hạn theo device, kiểm tra evidence hiện tại và giải quyết ưu tiên trước tạo command. Hiện các bản flow03 đã gửi CHƯA đọc proposal. Không cho WF07–09 gọi commands/manual hoặc dispatch để đi tắt.
4. Hiệp: nhận event gồm event_key, dedup_key, source, type, severity, recovered, reason, device_id, room_code, telemetry_id, observed_at, evidence. Chống trùng event_key, nhóm sự cố theo dedup_key. Cần endpoint và phản hồi xác nhận đã lưu để cập nhật delivery_status. Gói này chưa tự POST vào một endpoint giả và chưa đánh dấu DELIVERED.
5. Nhóm chốt nơi gửi email: giữ tại 07–09 hoặc chuyển về WF10, không bật cả hai cho cùng sự kiện. Các event giữ PENDING_WF10 ngay cả khi đã gửi email vì hai việc khác nhau.

## Giới hạn nghiệm thu

Đã có bộ test core, SQL PGlite (PostgreSQL WASM), build TypeScript, kiểm tra mã Code node và các connections JSON. Không thay cho thử import/execution trên n8n thật, Gmail OAuth thật hoặc PostgreSQL Docker của Dương. Chưa có bằng chứng runtime đó trong gói.

Chưa hoàn thành: WF03 tiêu thụ proposal, WF10 ghi incident, báo cáo dùng dữ liệu năng lượng, frontend hiển thị nguyên nhân giám sát, Return AUTO sớm, tốc độ quạt/độ sáng đèn, nghiệm thu chuỗi đầy đủ và hosting. Gói này không chứng nhận toàn bộ phần Dương hoàn thành.
