# Quy trình migration cho nhóm

## Quyết định nền

- PostgreSQL 16; DB mới `smart_classroom_v2`.
- TypeORM `synchronize:false`, `migrationsRun:false`.
- Migration được chạy có chủ đích trước khi mở backend.
- Lịch sử tại `schema_migrations`; seed tách khỏi schema.
- Backend check còn migration pending và dừng rõ lỗi nếu chưa chạy.
- Schema chính thức là các file migration. Không có lệnh schema sync/generate tự động trong bản nền.

## Ai làm gì?

Khoa bàn giao schema ban đầu. Sau bàn giao, Vinh review thay đổi DB lõi; Hiệp tự viết migration cho incidents/reports theo module phụ trách. Ai thêm tính năng thay DB phải commit cả migration cùng code. Không giao migration cho người khác đoán từ DTO.

## Máy mới

Chạy từ root:

```powershell
npm run setup
npm run install:all
npm run db:up
# Đợi docker compose ps báo healthy
npm run db:migrate
npm run db:seed
npm run db:status
```

## Thêm một migration

Ví dụ thêm người phụ trách sự cố. Từ root:

```powershell
cd backend
npm run migration:create -- src/database/migrations/AddIncidentAssignee
```

CLI tạo file có timestamp. Giữ nguyên timestamp trong filename và class. Ví dụ nội dung (thay tên class bằng tên CLI vừa tạo):

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddIncidentAssignee1792290000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE incidents ADD COLUMN assignee_name varchar(120)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE incidents DROP COLUMN assignee_name`);
  }
}
```

Chạy:

```powershell
npm run migration:show
npm run migration:run
```

Không phải chỉnh danh sách import: data-source tự tìm file trong thư mục migrations. Trên backend build, CLI production dùng file JS:

```powershell
npm run build
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

Không trộn migration TS và JS trong cùng thư mục src; output build luôn nằm dist. Không chạy migration đồng thời từ nhiều terminal/CI job.

## Trước khi commit

1. Chạy up trên DB development riêng có dữ liệu mẫu.
2. Kiểm tra API liên quan và dữ liệu có được bảo toàn không.
3. Thử down/up **trên DB thử nghiệm có thể xóa**, không thử trên DB dùng chung.
4. Kiểm tra tên cột, FK, index, nullable/default và tác động dữ liệu cũ.
5. Commit migration + code + cập nhật contract trong cùng PR.
6. Nhờ Vinh review SQL và thứ tự phụ thuộc.

Không sửa nội dung migration đã merge/đã chạy trên máy thành viên khác. Muốn sửa schema, thêm migration mới. TypeORM theo dõi tên/timestamp, không phải công cụ so sánh nội dung file đã sửa.

## Thành viên pull về

```powershell
git pull
npm run install:all
npm run db:status
npm run db:migrate
npm run db:seed
```

Restart backend sau migration. Dữ liệu local vẫn khác nhau; chỉ schema + seed tối thiểu được đồng bộ. Không copy file trong Docker volume để “đồng bộ DB”.

## Rollback

`npm run db:revert` ở root chỉ revert **migration mới nhất**. Down có thể xóa cột/bảng và mất dữ liệu. Đặc biệt revert migration ban đầu sẽ xóa toàn bộ bảng nghiệp vụ. Không dùng như bước cài đặt thường ngày. Ưu tiên migration sửa tiến thay vì rollback schema đã dùng chung; sao lưu trước thay đổi phá hủy.

## Conflict khi hai người cùng sửa DB

- Giữ timestamp riêng và không đổi migration đã áp dụng.
- Nếu B phụ thuộc cột của A, merge A trước, tạo migration B mới có timestamp sau A.
- Kiểm tra từ DB rỗng up toàn bộ và từ DB đang dùng up phần mới.
- Không xóa record schema_migrations để ép chạy lại.
- Không chạy `docker compose down -v` để chữa mọi lỗi: tùy chọn `-v` xóa volume, mất dữ liệu local.

## Seed

Seed dùng `ON CONFLICT` và kiểm tra policy đã tồn tại. Chạy lại không reset state, không ghi đè policy hiện có. Nếu cần dữ liệu demo mới, viết seed có kiểm soát; telemetry/command test không nằm trong seed.
