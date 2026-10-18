# Kiểm thử bản nền

Môi trường xây dựng: Node.js 24.19.0, Linux. Yêu cầu người dùng: Node >=22.9.

Đã đạt:
- NestJS TypeScript build.
- Next.js production build (App Router, webpack) và kiểm tra TypeScript.
- 2 test tích hợp backend trên PGlite (PostgreSQL nhúng): SQL migration up/down/up, seed hai lần, dedup telemetry và command, actual state chờ ACK, claim, ACK trùng, timeout/ACK muộn, dashboard.
- Nest HTTP thật gọi bằng simulator đã đóng gói: telemetry → API, heartbeat → API, command → dispatch → claim → ACK → dashboard; validation 400.
- 11 test của simulator độc lập (logic và HTTP).

Giới hạn xác minh:
- PGlite chạy SQL PostgreSQL trong tiến trình test, không thay việc chạy Docker PostgreSQL16 bằng TypeORM CLI trên máy người dùng. Chưa thử multi-worker claim đồng thời trên PostgreSQL Docker.
- Chưa nối n8n của nhóm hoặc host thực tế.
- Frontend build thành công, chưa nghiệm thu trực quan trình duyệt trong môi trường xây dựng.

Sau giải nén cần: setup → install → DB healthy → migrate → seed → chạy 3 dịch vụ → simulator HTTP/Start → npm run smoke. Đó là bài kiểm tra nghiệm thu local.
