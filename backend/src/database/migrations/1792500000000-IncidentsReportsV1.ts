import { MigrationInterface, QueryRunner } from 'typeorm';
export class IncidentsReportsV11792500000000 implements MigrationInterface {
 name='IncidentsReportsV11792500000000';
 async up(q:QueryRunner):Promise<void>{await q.query(`
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_to varchar(150);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id);
UPDATE incidents i SET room_id=d.room_id FROM devices d WHERE i.device_id=d.id AND i.room_id IS NULL;
CREATE INDEX IF NOT EXISTS incidents_room_status_time ON incidents(room_id,status,severity,last_seen DESC);
CREATE INDEX IF NOT EXISTS reports_type_period ON reports(type,period_start DESC,status);
CREATE TABLE IF NOT EXISTS app_notifications (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id), kind varchar(40) NOT NULL,
 title varchar(250) NOT NULL, body text NOT NULL DEFAULT '', read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_notifications_unread ON app_notifications(created_at DESC) WHERE read_at IS NULL;
CREATE TABLE IF NOT EXISTS incident_timeline (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id), event_type varchar(50) NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incident_timeline_time ON incident_timeline(incident_id,created_at);
`);}
 async down(q:QueryRunner):Promise<void>{await q.query(`DROP TABLE IF EXISTS incident_timeline; DROP TABLE IF EXISTS app_notifications; DROP INDEX IF EXISTS incident_timeline_time; DROP INDEX IF EXISTS app_notifications_unread; DROP INDEX IF EXISTS reports_type_period; DROP INDEX IF EXISTS incidents_room_status_time; ALTER TABLE incidents DROP COLUMN IF EXISTS room_id; ALTER TABLE incidents DROP COLUMN IF EXISTS assigned_to; ALTER TABLE incidents DROP COLUMN IF EXISTS acknowledged_at;`);}
}
