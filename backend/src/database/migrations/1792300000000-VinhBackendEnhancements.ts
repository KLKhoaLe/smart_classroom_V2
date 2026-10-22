import { MigrationInterface, QueryRunner } from 'typeorm';

export class VinhBackendEnhancements1792300000000 implements MigrationInterface {
  name = 'VinhBackendEnhancements1792300000000';

  async up(q: QueryRunner): Promise<void> {
    // 1. Thêm capabilities cho devices (mặc định các actuator sẵn có)
    await q.query(`
      ALTER TABLE devices 
      ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT ARRAY['FAN','LIGHT','VENTILATION','DEHUMIDIFIER'];
    `);

    // 2. Thêm simulated_state cho device_states để đối chiếu tách biệt với actual_state
    await q.query(`
      ALTER TABLE device_states 
      ADD COLUMN IF NOT EXISTS simulated_state varchar(10) CHECK(simulated_state IN ('ON','OFF'));
    `);

    // 3. Thêm bảng users phục vụ xác thực và phân quyền RBAC (Viewer / Operator / Admin)
    await q.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        username varchar(80) UNIQUE NOT NULL,
        password_hash varchar(255) NOT NULL,
        role varchar(20) NOT NULL CHECK(role IN ('VIEWER','OPERATOR','ADMIN')),
        name varchar(150) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 4. Index hỗ trợ phân trang và tìm kiếm nhanh
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_commands_device_created ON device_commands(device_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_commands_status ON device_commands(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_expires ON control_proposals(expires_at DESC);
      CREATE INDEX IF NOT EXISTS idx_overrides_expires ON manual_overrides(expires_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_overrides_expires;`);
    await q.query(`DROP INDEX IF EXISTS idx_proposals_expires;`);
    await q.query(`DROP INDEX IF EXISTS idx_commands_status;`);
    await q.query(`DROP INDEX IF EXISTS idx_commands_device_created;`);
    await q.query(`DROP TABLE IF EXISTS users;`);
    await q.query(`ALTER TABLE device_states DROP COLUMN IF EXISTS simulated_state;`);
    await q.query(`ALTER TABLE devices DROP COLUMN IF EXISTS capabilities;`);
  }
}
