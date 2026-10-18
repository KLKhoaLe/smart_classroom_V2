# Bàn giao nhóm từ bản nền

## Khoa

- Dựng repo/môi trường/DB theo README; chạy setup, migrate, seed và smoke.
- Hoàn thiện flow01–03, policy guardrails, điều phối ưu tiên, AI/fallback, nhận manual requests.
- Giữ simulator engine; thống nhất payload với Vinh/Dương.
- Ghi rõ direct-backend smoke mode khác đường nghiệp vụ qua n8n.

## Quang Vinh

- Tiếp quản database migrations, thiết bị và commands API/flow04–06.
- Hoàn thiện retry/expiry/lease theo nhu cầu, auth/RBAC và API proposal/policy/overrides/schedules/run.
- Review migration incidents/reports của Hiệp.
- Cần giữ invariant: ACK không cập nhật nhầm thiết bị/actuator hoặc lệnh cũ.

## Dương

- Tiếp quản frontend/app và components; hoàn thiện trải nghiệm, charts, manual override UI.
- Tiếp quản UI simulator; engine do Khoa giữ.
- Flow07–09 tạo đề xuất; không điều khiển actuator trực tiếp bỏ flow03.

## Hiệp

- Bổ sung API ghi incidents/reports, migration mở rộng cần thiết và giao diện tương ứng.
- Flow10–12, test scenario, bằng chứng trình bày.
- GET incidents/reports đã có nhưng hiện rỗng đúng thực tế; không coi trang khung là tính năng hoàn chỉnh.

## Quy tắc chung

- PR theo tính năng; không commit .env, node_modules, .next, dist, simulator/data hoặc DB dump.
- Commit package-lock khi thay dependency; cài bằng npm ci khi pull.
- Không sửa migration cũ sau khi nhóm đã chạy.
- Một thay đổi contract phải cập nhật DTO + API.md + payload flow/simulator liên quan.
- Nghiệm thu mỗi người: code, 3 JSON flow, cấu hình, payload ví dụ, happy/error path và execution minh chứng.
