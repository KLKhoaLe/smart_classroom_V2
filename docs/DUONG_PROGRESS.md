# Tiến độ Dương — cập nhật 20/10/2026

Repo: KLKhoaLe/smart_classroom_V2. Đối chiếu main tại commit e2b3334569e232536bf61ab1e656c7526b8fdfa0.

| Hạng mục | Trạng thái có bằng chứng | Việc tiếp theo |
| --- | --- | --- |
| Dashboard: dữ liệu mới/cũ, lỗi API từng phần, giữ số liệu | PR #1 đã merge; đủ 10 file và 3 commit trên main | Duy trì test khi sửa tiếp |
| UI chọn thời gian giữ thủ công, đếm ngược override | Code đã chuẩn bị trong nhánh tính năng; test tự động/build đã đạt ở môi trường chuẩn bị | Dương chạy A–D trong DUONG_MANUAL_OVERRIDE_UI.md, commit/push và tạo PR; chưa ghi là đã merge |
| Biểu đồ/lịch sử cảm biến | Chưa hoàn thành trong các PR này | Làm nhánh frontend riêng |
| UI simulator theo phân công | Chưa hoàn thiện bổ sung trong các PR này | Chỉ sửa UI, engine phối hợp Khoa |
| WF07 môi trường | Chưa triển khai bản tích hợp V2 | Thống nhất API/state/proposal và nhánh nhận đề xuất ở flow03 |
| WF08 năng lượng | Chưa triển khai bản tích hợp V2 | Thống nhất telemetry, occupancy, power, thời gian và lưu tổng hợp |
| WF09 ngoài giờ | Chưa triển khai bản tích hợp V2 | Thống nhất lịch/timezone và incident candidate với Hiệp |

Main hiện có flow01–03 V3 và API automation/resolve, guarded dispatch, GET automation/overrides/:device. Flow03 ghi rõ chưa nhận control_proposals từ WF07–09. Không coi API automation/resolve hiện tại là API proposal; không cho WF07 tự tạo command đi tắt.

Cần trao đổi Khoa/Vinh: payload và endpoint tạo/thu hồi proposal, khóa chống lặp, thời hạn/độ ưu tiên, nơi lưu trạng thái duy trì điều kiện, cách flow03 hợp nhất proposal. Cần Hiệp xác nhận endpoint/contract incident candidate của WF09. Có thể tiếp tục phần giao diện bằng API đã có trong khi nhóm chốt contract.

Không quy đổi số commit thành phần trăm hoàn thành. Mỗi chức năng phải có code, test và bằng chứng local; sau đó mới cập nhật đã nghiệm thu/merge.
