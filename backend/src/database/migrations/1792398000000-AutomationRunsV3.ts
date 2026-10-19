import { MigrationInterface, QueryRunner } from 'typeorm';
export class AutomationRunsV31792398000000 implements MigrationInterface {
 name='AutomationRunsV31792398000000';
 async up(q:QueryRunner):Promise<void>{await q.query(`CREATE TABLE automation_runs (
 request_key varchar(180) PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id),
 fingerprint varchar(64) NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
 ); CREATE INDEX automation_runs_device_time ON automation_runs(device_id,created_at DESC);`);}
 async down(q:QueryRunner):Promise<void>{await q.query('DROP TABLE automation_runs');}
}
