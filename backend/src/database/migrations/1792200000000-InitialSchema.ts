import { MigrationInterface, QueryRunner } from 'typeorm';
export class InitialSchema1792200000000 implements MigrationInterface {
 name='InitialSchema1792200000000';
 async up(q:QueryRunner):Promise<void>{await q.query(`
CREATE TABLE rooms (
 id uuid PRIMARY KEY, code varchar(50) UNIQUE NOT NULL, name varchar(150) NOT NULL,
 timezone varchar(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE devices (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id), code varchar(80) UNIQUE NOT NULL,
 name varchar(150) NOT NULL, adapter varchar(20) NOT NULL DEFAULT 'HTTP', enabled boolean NOT NULL DEFAULT true,
 last_seen timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE policies (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id), version integer NOT NULL CHECK(version>0),
 config jsonb NOT NULL, active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(room_id,version)
);
CREATE UNIQUE INDEX one_active_policy ON policies(room_id) WHERE active;
CREATE TABLE schedules (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id), name varchar(120) NOT NULL,
 weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6), starts_at time NOT NULL, ends_at time NOT NULL,
 CHECK(ends_at>starts_at)
);
CREATE TABLE telemetry (
 id uuid PRIMARY KEY, event_id uuid UNIQUE NOT NULL, run_id uuid NOT NULL,
 device_id uuid NOT NULL REFERENCES devices(id), sequence bigint NOT NULL CHECK(sequence>=0),
 observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 temperature double precision NOT NULL CHECK(temperature BETWEEN -10 AND 60),
 humidity double precision NOT NULL CHECK(humidity BETWEEN 0 AND 100),
 light_percent double precision NOT NULL CHECK(light_percent BETWEEN 0 AND 100),
 occupancy_count integer NOT NULL CHECK(occupancy_count BETWEEN 0 AND 100),
 co2_ppm double precision NOT NULL CHECK(co2_ppm BETWEEN 300 AND 5000),
 power_w double precision NOT NULL CHECK(power_w BETWEEN 0 AND 20000),
 door_open boolean NOT NULL, simulated boolean NOT NULL DEFAULT true, raw_payload jsonb NOT NULL
);
CREATE INDEX telemetry_device_time ON telemetry(device_id,observed_at DESC,sequence DESC);
CREATE INDEX telemetry_received ON telemetry(received_at DESC);
CREATE TABLE ingestion_errors (
 id uuid PRIMARY KEY, device_code varchar(80), reason text NOT NULL, raw_payload jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE automation_decisions (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id),
 telemetry_id uuid REFERENCES telemetry(id), source varchar(20) NOT NULL CHECK(source IN ('AI','RULE','MANUAL')),
 reason text NOT NULL, actions jsonb NOT NULL, evidence jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE control_proposals (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), telemetry_id uuid REFERENCES telemetry(id),
 source varchar(50) NOT NULL, desired_state jsonb NOT NULL, priority integer NOT NULL DEFAULT 0,
 reason text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE device_commands (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), decision_id uuid REFERENCES automation_decisions(id),
 sequence bigserial UNIQUE NOT NULL, idempotency_key varchar(180) UNIQUE NOT NULL,
 command_type varchar(30) NOT NULL CHECK(command_type IN ('FAN','LIGHT','VENTILATION','DEHUMIDIFIER')),
 action varchar(10) NOT NULL CHECK(action IN ('ON','OFF')),
 source varchar(20) NOT NULL CHECK(source IN ('AUTO','MANUAL','TEST')),
 status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','QUEUED','SENT','ACK','FAILED','TIMED_OUT','CANCELLED')),
 requested_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 sent_at timestamptz, acknowledged_at timestamptz, ack_payload jsonb,
 CHECK(expires_at>requested_at)
);
CREATE INDEX commands_queue ON device_commands(device_id,status,sequence);
CREATE TABLE device_states (
 device_id uuid NOT NULL REFERENCES devices(id), command_type varchar(30) NOT NULL,
 desired_state varchar(10) NOT NULL DEFAULT 'OFF' CHECK(desired_state IN ('ON','OFF')),
 actual_state varchar(10) CHECK(actual_state IN ('ON','OFF')),
 desired_sequence bigint NOT NULL DEFAULT 0, actual_sequence bigint NOT NULL DEFAULT 0,
 confirmed_at timestamptz,
 PRIMARY KEY(device_id,command_type), CHECK(command_type IN ('FAN','LIGHT','VENTILATION','DEHUMIDIFIER'))
);
CREATE TABLE device_events (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), command_id uuid REFERENCES device_commands(id),
 event_type varchar(50) NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(command_id,event_type)
);
CREATE TABLE manual_overrides (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), command_type varchar(30) NOT NULL,
 action varchar(10) NOT NULL CHECK(action IN ('ON','OFF')), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(device_id,command_type)
);
CREATE TABLE incidents (
 id uuid PRIMARY KEY, device_id uuid REFERENCES devices(id), dedup_key varchar(180) NOT NULL,
 type varchar(80) NOT NULL, severity varchar(20) NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')),
 status varchar(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
 title varchar(250) NOT NULL, details jsonb NOT NULL DEFAULT '{}', count integer NOT NULL DEFAULT 1,
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX one_open_incident ON incidents(dedup_key) WHERE status<>'RESOLVED';
CREATE TABLE reports (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id), type varchar(20) NOT NULL CHECK(type IN ('DAILY','WEEKLY')),
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, metrics jsonb NOT NULL DEFAULT '{}',
 summary text NOT NULL DEFAULT '', status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(room_id,type,period_start,period_end), CHECK(period_end>period_start)
);
CREATE TABLE simulation_runs (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), scenario varchar(80) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'STOPPED', config jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
`);}
 async down(q:QueryRunner):Promise<void>{await q.query(`
DROP TABLE simulation_runs; DROP TABLE reports; DROP TABLE incidents; DROP TABLE manual_overrides;
DROP TABLE device_events; DROP TABLE device_states; DROP TABLE device_commands; DROP TABLE control_proposals;
DROP TABLE automation_decisions; DROP TABLE ingestion_errors; DROP TABLE telemetry;
DROP TABLE schedules; DROP TABLE policies; DROP TABLE devices; DROP TABLE rooms;
`);}
}
