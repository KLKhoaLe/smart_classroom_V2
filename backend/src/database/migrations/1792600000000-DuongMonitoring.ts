import {MigrationInterface, QueryRunner} from 'typeorm';
export class DuongMonitoring1792600000000 implements MigrationInterface {
 name='DuongMonitoring1792600000000';
 async up(q:QueryRunner):Promise<void>{await q.query(`
 CREATE TABLE duong_monitoring_settings (
  room_id uuid PRIMARY KEY REFERENCES rooms(id), config jsonb NOT NULL
 );
 CREATE TABLE duong_monitoring_states (
  device_id uuid NOT NULL REFERENCES devices(id), flow integer NOT NULL CHECK(flow IN (7,8,9)),
  version integer NOT NULL DEFAULT 0, state jsonb, proposal_id uuid NOT NULL,
  PRIMARY KEY(device_id,flow)
 );
 CREATE TABLE duong_monitoring_results (
  flow integer NOT NULL CHECK(flow IN (7,8,9)), telemetry_id uuid NOT NULL REFERENCES telemetry(id),
  device_id uuid NOT NULL REFERENCES devices(id), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(flow,telemetry_id)
 );
 CREATE TABLE duong_monitoring_events (
  id uuid PRIMARY KEY, event_key text UNIQUE NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id), flow integer NOT NULL CHECK(flow IN (7,8,9)),
  payload jsonb NOT NULL, delivery_status text NOT NULL DEFAULT 'PENDING_WF10',
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(delivery_status IN ('PENDING_WF10','DELIVERED'))
 );
 CREATE INDEX duong_events_pending ON duong_monitoring_events(delivery_status,created_at);
 `);}
 async down(q:QueryRunner):Promise<void>{await q.query(`
 DELETE FROM control_proposals WHERE id IN (SELECT proposal_id FROM duong_monitoring_states);
 DROP TABLE duong_monitoring_events; DROP TABLE duong_monitoring_results;
 DROP TABLE duong_monitoring_states; DROP TABLE duong_monitoring_settings;
 `);}
}
