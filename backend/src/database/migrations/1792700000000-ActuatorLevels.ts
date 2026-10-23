import { MigrationInterface, QueryRunner } from 'typeorm';
export class ActuatorLevels1792700000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const table of ['device_commands', 'manual_overrides']) await q.query(`ALTER TABLE ${table} ADD COLUMN level smallint,
      ADD CONSTRAINT ${table}_level_valid CHECK(level IS NULL OR (
        command_type IN ('FAN','LIGHT') AND level BETWEEN 0 AND CASE WHEN command_type='FAN' THEN 3 ELSE 100 END
        AND ((action='OFF' AND level=0) OR (action='ON' AND level>0))));`);
    await q.query(`ALTER TABLE device_states ADD COLUMN desired_level smallint, ADD COLUMN actual_level smallint,
      ADD CONSTRAINT desired_level_valid CHECK(desired_level IS NULL OR (command_type IN ('FAN','LIGHT') AND desired_level BETWEEN 0 AND CASE WHEN command_type='FAN' THEN 3 ELSE 100 END AND ((desired_state='OFF' AND desired_level=0) OR (desired_state='ON' AND desired_level>0)))),
      ADD CONSTRAINT actual_level_valid CHECK(actual_level IS NULL OR (actual_state IS NOT NULL AND command_type IN ('FAN','LIGHT') AND actual_level BETWEEN 0 AND CASE WHEN command_type='FAN' THEN 3 ELSE 100 END AND ((actual_state='OFF' AND actual_level=0) OR (actual_state='ON' AND actual_level>0))));`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE device_states DROP COLUMN actual_level, DROP COLUMN desired_level');
    for (const table of ['device_commands', 'manual_overrides']) await q.query(`ALTER TABLE ${table} DROP COLUMN level`);
  }
}
