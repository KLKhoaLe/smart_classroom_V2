# Kiến trúc và ranh giới bản nền

## Các tiến trình

1. Next.js (3000): giao diện, proxy API cùng origin. API_TOKEN chỉ ở server. Không kết nối DB.
2. NestJS (3001): validate, giao dịch, persistence, lifecycle command. Cổng duy nhất vào PostgreSQL nghiệp vụ.
3. PostgreSQL (5433 host): dữ liệu và constraints. Migration chạy tách trước startup.
4. Simulator (4310): cảm biến giả, loop phát dữ liệu, claim lệnh và ACK. UI và engine cùng tiến trình Node nhưng loop không phụ thuộc tab.
5. n8n (5678, có sẵn của nhóm): điều phối/AI/rule sau khi nối các flow. Không lưu thay DB nghiệp vụ.

## Đường chạy khi kiểm tra nền

Simulator → telemetry/heartbeat API → PostgreSQL → dashboard GET.
Script smoke → create command PENDING → dispatch QUEUED → simulator claim SENT → thực thi giả → ACK API → DB actual_state → dashboard.

## Đường chạy mục tiêu

Simulator → flow01 → telemetry API → flow07–09 proposals → flow02 → decision API → flow03 → command API → flow04 dispatch → claim → simulator → flow05 ACK → backend.
Heartbeat → flow06 → heartbeat API; Schedule flow06 gọi expire/check-offline. Các flow phát sinh incident candidate → flow10; báo cáo flow11/12 gọi API nhóm bổ sung.

## Các quyết định thiết kế

- HTTP trước để chạy demo thuận tiện; MQTT adapter/Wokwi chưa đưa vào nền v2.
- DB mới để không phá phiên bản cũ.
- SQL-first migrations; không bật synchronize, không có entity gây hai nguồn schema khác nhau.
- event_id chống telemetry trùng; idempotency_key chống lệnh trùng. Payload cùng ID nhưng khác nội dung bị 409.
- Claim dùng transaction + FOR UPDATE SKIP LOCKED, không SELECT rồi UPDATE tách rời.
- Desired và actual tách riêng. Chỉ ACK SUCCESS hợp lệ mới cập nhật actual.
- Sequence command là bigserial toàn cục; so sánh sequence trên từng actuator khi ghi actual, không dùng sequence telemetry.
- ACK muộn không ghi đè trạng thái mới. Lệnh hết TTL không được claim.
- Không có scheduler ẩn trong backend tự tạo incident/rule; flow06 chịu trách nhiệm gọi định kỳ.
- Telemetry có thể ghi nhận gateway còn liên lạc. Online dựa received last_seen trong 90 giây; telemetry cũ và online là hai khái niệm riêng, UI hiển thị timestamp và cảnh báo stale >30s.

## Những giới hạn cố ý của bản nền

- Không retry lease command sau khi SENT bị mất ACK. TTL chuyển TIMED_OUT; flow03/06 quyết định phát lệnh mới hoặc khôi phục trong giai đoạn tiếp theo.
- Không có account/login/RBAC; API_TOKEN là service secret tùy chọn cho local, không phải phân quyền người dùng.
- Không tự lưu heartbeat thành incident; check-offline chỉ trả danh sách.
- Không có API ghi proposal/policy/override/report/incident/run; chỉ schema chuẩn bị và phần đọc đã ghi trong API.md.
- Không tạo AI, kết luận hay dữ liệu report giả để giao diện đầy số.
- Chưa gom mọi dịch vụ vào Docker production; không deploy host trong lượt tạo base này.
