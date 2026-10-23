import { ConflictException } from '@nestjs/common';
import { ClearOverrideDto, TYPES } from '../common/dto';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { OverrideDto, PolicyUpdateDto, ProposalDto, ScheduleDto, SimulationRunDto } from '../common/dto';

@Injectable()
export class DeviceService {
  constructor(private readonly db: DataSource) {}

  async resolve(ref: string, q: DataSource | EntityManager = this.db) {
    const [d] = await q.query(
      `SELECT d.*, r.code AS room_code 
       FROM devices d 
       JOIN rooms r ON r.id=d.room_id 
       WHERE (d.id::text=$1 OR d.code=$1) AND d.enabled`,
      [ref]
    );
    if (!d) throw new NotFoundException('Không tìm thấy thiết bị đang bật: ' + ref);
    if (!d.capabilities) {
      d.capabilities = ['FAN', 'LIGHT', 'VENTILATION', 'DEHUMIDIFIER'];
    }
    return d;
  }

  rooms() {
    return this.db.query(`SELECT * FROM rooms ORDER BY code`);
  }

  list() {
    return this.db.query(
      `SELECT d.*, r.code AS room_code, (d.last_seen > now() - interval '90 seconds') IS TRUE AS online 
       FROM devices d 
       JOIN rooms r ON r.id=d.room_id 
       ORDER BY d.code`
    );
  }

  async heartbeat(ref: string) {
    const d = await this.resolve(ref);
    const [row] = await this.db.query(
      `WITH updated AS (
         UPDATE devices SET last_seen=now() WHERE id=$1 RETURNING id AS device_id, last_seen
       ) 
       SELECT * FROM updated`,
      [d.id]
    );
    return { ok: true, device_code: d.code, ...row };
  }

  offline() {
    return this.db.query(
      `SELECT id AS device_id, code, last_seen 
       FROM devices 
       WHERE enabled AND (last_seen IS NULL OR last_seen < now() - interval '90 seconds')`
    );
  }

  async states(ref: string) {
    const d = await this.resolve(ref);
    return this.db.query(`SELECT * FROM device_states WHERE device_id=$1 ORDER BY command_type`, [d.id]);
  }

  // === POLICIES ===
  async policy(room: string) {
    const [r] = await this.db.query(
      `SELECT p.*, r.code AS room_code 
       FROM policies p 
       JOIN rooms r ON r.id=p.room_id 
       WHERE r.code=$1 AND p.active`,
      [room]
    );
    if (!r) throw new NotFoundException('Chưa có policy đang hoạt động cho phòng: ' + room);
    return r;
  }

  async listPolicies(room?: string) {
    return this.db.query(
      `SELECT p.*, r.code AS room_code 
       FROM policies p 
       JOIN rooms r ON r.id=p.room_id 
       WHERE ($1::text IS NULL OR r.code=$1) 
       ORDER BY p.created_at DESC`,
      [room ?? null]
    );
  }

  async createPolicy(room: string, dto: PolicyUpdateDto) {
    const [r] = await this.db.query(`SELECT id FROM rooms WHERE code=$1`, [room]);
    if (!r) throw new NotFoundException('Không tìm thấy phòng: ' + room);

    return this.db.transaction(async q => {
      const [latest] = await q.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM policies WHERE room_id=$1`,
        [r.id]
      );
      const nextVersion = latest.next_version;

      if (dto.active !== false) {
        await q.query(`UPDATE policies SET active=false WHERE room_id=$1`, [r.id]);
      }

      const [created] = await q.query(
        `INSERT INTO policies(id, room_id, version, active, config) 
         VALUES($1, $2, $3, $4, $5::jsonb) 
         RETURNING *`,
        [randomUUID(), r.id, nextVersion, dto.active !== false, JSON.stringify(dto.config)]
      );
      return created;
    });
  }

  // === MANUAL OVERRIDES ===
  async getOverrides(room?: string) {
    return this.db.query(
      `SELECT o.*, d.code AS device_code, r.code AS room_code,
              ROUND(EXTRACT(EPOCH FROM (o.expires_at - now())) / 60) AS remaining_minutes
       FROM manual_overrides o
       JOIN devices d ON d.id=o.device_id
       JOIN rooms r ON r.id=d.room_id
       WHERE o.expires_at > now() AND ($1::text IS NULL OR r.code=$1)
       ORDER BY o.created_at DESC`,
      [room ?? null]
    );
  }

  async setOverride(b: OverrideDto) {
    const d = await this.resolve(b.device_id);
    const minutes = b.override_minutes || 30;
    const [row] = await this.db.query(
      `INSERT INTO manual_overrides(id, device_id, command_type, action, expires_at)
       VALUES($1, $2, $3, $4, now() + ($5 * interval '1 minute'))
       ON CONFLICT(device_id, command_type)
       DO UPDATE SET action=EXCLUDED.action, expires_at=EXCLUDED.expires_at
       RETURNING *`,
      [randomUUID(), d.id, b.command_type, b.action, minutes]
    );
    return { ok: true, device_code: d.code, ...row };
  }

  async clearOverride(ref: string, commandType: string, expected: ClearOverrideDto = {}) {
    if (!(TYPES as readonly string[]).includes(commandType)) throw new BadRequestException('Loại thiết bị không hợp lệ.');
    const d = await this.resolve(ref);
    return this.db.transaction(async q => {
      // Same device lock as resolve/claim/ACK: an unsent command cannot escape cancellation.
      await q.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE', [d.id]);
      const [current] = await q.query('SELECT * FROM manual_overrides WHERE device_id=$1 AND command_type=$2', [d.id, commandType]);
      if (current && ((expected.expected_id && current.id !== expected.expected_id) ||
        (expected.expected_expires_at && new Date(current.expires_at).getTime() !== Date.parse(expected.expected_expires_at)))) {
        throw new ConflictException('Chế độ giữ đã thay đổi. Làm mới trước khi trả về AUTO.');
      }
      await q.query('DELETE FROM manual_overrides WHERE device_id=$1 AND command_type=$2', [d.id, commandType]);
      const cancelled = await q.query(`WITH cancelled AS (
        UPDATE device_commands SET status='CANCELLED'
        WHERE device_id=$1 AND command_type=$2 AND source='MANUAL' AND status IN ('PENDING','QUEUED')
        RETURNING id) SELECT * FROM cancelled`, [d.id, commandType]);
      const sent = await q.query(`SELECT id FROM device_commands WHERE device_id=$1 AND command_type=$2 AND status='SENT' AND expires_at>clock_timestamp()`, [d.id, commandType]);
      if (current || cancelled.length) await q.query(`INSERT INTO device_events(id,device_id,event_type,payload)
        VALUES($1,$2,'MANUAL_RELEASED',$3::jsonb)`, [randomUUID(), d.id, JSON.stringify({command_type:commandType,cancelled:cancelled.map((c:any)=>c.id)})]);
      return {ok:true,deleted:!!current,mode:'AUTO',cancelled_commands:cancelled.length,awaiting_ack:sent.length>0};
    });
  }

  // === CONTROL PROPOSALS (cho WF07-09) ===
  async createProposal(b: ProposalDto) {
    const d = await this.resolve(b.device_id);
    const [row] = await this.db.query(
      `INSERT INTO control_proposals(id, device_id, telemetry_id, source, desired_state, priority, reason, expires_at)
       VALUES($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING *`,
      [
        randomUUID(),
        d.id,
        b.telemetry_id ?? null,
        b.source,
        JSON.stringify(b.desired_state),
        b.priority ?? 0,
        b.reason,
        b.expires_at
      ]
    );
    return { ok: true, device_code: d.code, ...row };
  }

  async listProposals(ref?: string) {
    let deviceId: string | null = null;
    if (ref) {
      const d = await this.resolve(ref);
      deviceId = d.id;
    }
    return this.db.query(
      `SELECT p.*, d.code AS device_code 
       FROM control_proposals p
       JOIN devices d ON d.id=p.device_id
       WHERE p.expires_at > now() AND ($1::uuid IS NULL OR p.device_id=$1)
       ORDER BY p.priority DESC, p.created_at DESC`,
      [deviceId]
    );
  }

  // === SCHEDULES ===
  async getSchedules(room: string) {
    return this.db.query(
      `SELECT s.*, r.code AS room_code 
       FROM schedules s
       JOIN rooms r ON r.id=s.room_id
       WHERE r.code=$1
       ORDER BY s.weekday, s.starts_at`,
      [room]
    );
  }

  async createSchedule(b: ScheduleDto) {
    const [r] = await this.db.query(`SELECT id FROM rooms WHERE id=$1`, [b.room_id]);
    if (!r) throw new NotFoundException('Không tìm thấy phòng.');
    const [row] = await this.db.query(
      `INSERT INTO schedules(id, room_id, name, weekday, starts_at, ends_at)
       VALUES($1, $2, $3, $4, $5::time, $6::time)
       RETURNING *`,
      [randomUUID(), b.room_id, b.name, b.weekday, b.starts_at, b.ends_at]
    );
    return row;
  }

  // === SIMULATION RUNS (cho worker Khoa) ===
  async getSimulationRuns(ref?: string) {
    let deviceId: string | null = null;
    if (ref) {
      const d = await this.resolve(ref);
      deviceId = d.id;
    }
    return this.db.query(
      `SELECT s.*, d.code AS device_code 
       FROM simulation_runs s
       JOIN devices d ON d.id=s.device_id
       WHERE ($1::uuid IS NULL OR s.device_id=$1)
       ORDER BY s.created_at DESC LIMIT 50`,
      [deviceId]
    );
  }

  async createSimulationRun(b: SimulationRunDto) {
    const d = await this.resolve(b.device_id);
    const [row] = await this.db.query(
      `INSERT INTO simulation_runs(id, device_id, scenario, status, config)
       VALUES($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [randomUUID(), d.id, b.scenario, b.status || 'RUNNING', JSON.stringify(b.config || {})]
    );
    return { ok: true, device_code: d.code, ...row };
  }

  async updateSimulationRun(id: string, status: string, config?: Record<string, unknown>) {
    const [row] = await this.db.query(
      `WITH updated AS (
         UPDATE simulation_runs 
         SET status=$2, config=COALESCE($3::jsonb, config) 
         WHERE id=$1 
         RETURNING *
       ) SELECT * FROM updated`,
      [id, status, config ? JSON.stringify(config) : null]
    );
    if (!row) throw new NotFoundException('Không tìm thấy simulation run: ' + id);
    return row;
  }
}
