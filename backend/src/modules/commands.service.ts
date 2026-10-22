import { Injectable, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AckDto, CommandDto, ManualDto, PaginationDto } from '../common/dto';
import { DeviceService } from './device.service';

@Injectable()
export class CommandsService {
  constructor(private readonly db: DataSource, private readonly devices: DeviceService) {}

  async create(b: CommandDto) {
    const d = await this.devices.resolve(b.device_id);

    // Kiểm tra capability của thiết bị
    if (d.capabilities && Array.isArray(d.capabilities) && !d.capabilities.includes(b.command_type)) {
      throw new BadRequestException(`Thiết bị ${d.code} không hỗ trợ tính năng ${b.command_type}.`);
    }

    return this.db.transaction(async q => {
      await q.query(`SELECT id FROM devices WHERE id=$1 FOR UPDATE`, [d.id]);
      if (b.decision_id) {
        const [decision] = await q.query(`SELECT id FROM automation_decisions WHERE id=$1 AND device_id=$2`, [b.decision_id, d.id]);
        if (!decision) throw new BadRequestException('Decision không thuộc thiết bị.');
      }

      const rows = await q.query(
        `INSERT INTO device_commands(id,device_id,decision_id,idempotency_key,command_type,action,source,expires_at) 
         VALUES($1,$2,$3,$4,$5,$6,$7,now()+($8 * interval '1 second')) 
         ON CONFLICT(idempotency_key) DO NOTHING 
         RETURNING *, id AS command_id`,
        [randomUUID(), d.id, b.decision_id ?? null, b.idempotency_key, b.command_type, b.action, b.source, b.ttl_seconds ?? 60]
      );

      if (!rows.length) {
        const [old] = await q.query(`SELECT *, id AS command_id FROM device_commands WHERE idempotency_key=$1`, [b.idempotency_key]);
        if (
          old.device_id !== d.id ||
          old.command_type !== b.command_type ||
          old.action !== b.action ||
          old.source !== b.source ||
          (old.decision_id ?? null) !== (b.decision_id ?? null)
        ) {
          throw new ConflictException('Idempotency key đã dùng cho yêu cầu khác.');
        }
        return { created: false, command: old };
      }

      const c = rows[0];
      await q.query(
        `INSERT INTO device_states(device_id,command_type,desired_state,desired_sequence) 
         VALUES($1,$2,$3,$4) 
         ON CONFLICT(device_id,command_type) 
         DO UPDATE SET desired_state=EXCLUDED.desired_state, desired_sequence=EXCLUDED.desired_sequence 
         WHERE device_states.desired_sequence < EXCLUDED.desired_sequence`,
        [d.id, b.command_type, b.action, c.sequence]
      );

      return { created: true, command: c };
    });
  }

  async get(id: string) {
    const [c] = await this.db.query(
      `SELECT c.*, c.id AS command_id, d.code AS device_code 
       FROM device_commands c 
       JOIN devices d ON d.id = c.device_id 
       WHERE c.id = $1`,
      [id]
    );
    if (!c) throw new NotFoundException('Không có command.');
    return c;
  }

  async list(query?: PaginationDto) {
    if (query?.page !== undefined || query?.limit !== undefined) {
      const page = Math.max(1, Number(query?.page || 1));
      const limit = Math.min(100, Math.max(1, Number(query?.limit || 20)));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (query?.device_id) {
        try {
          const d = await this.devices.resolve(query.device_id);
          conditions.push(`c.device_id = $${paramIndex++}`);
          params.push(d.id);
        } catch {
          conditions.push(`(c.device_id::text = $${paramIndex} OR d.code = $${paramIndex})`);
          paramIndex++;
          params.push(query.device_id);
        }
      }

      if (query?.status) {
        conditions.push(`c.status = $${paramIndex++}`);
        params.push(query.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await this.db.query(
        `SELECT count(*)::int AS total FROM device_commands c JOIN devices d ON d.id=c.device_id ${whereClause}`,
        params
      );
      const total = countRes[0]?.total || 0;

      const items = await this.db.query(
        `SELECT c.*, c.id AS command_id, d.code AS device_code 
         FROM device_commands c 
         JOIN devices d ON d.id=c.device_id 
         ${whereClause} 
         ORDER BY c.sequence DESC 
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      return {
        items,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      };
    }

    // Mặc định v1: trả về mảng trực tiếp
    return this.db.query(
      `SELECT c.*, c.id AS command_id, d.code AS device_code 
       FROM device_commands c 
       JOIN devices d ON d.id=c.device_id 
       ORDER BY c.sequence DESC LIMIT 100`
    );
  }

  async dispatch(id: string) {
    await this.expire();
    await this.db.query(`UPDATE device_commands SET status='QUEUED' WHERE id=$1 AND status='PENDING' AND expires_at>now()`, [id]);
    return this.get(id);
  }

  async cancel(id: string) {
    return this.db.transaction(async q => {
      const [c] = await q.query(`SELECT * FROM device_commands WHERE id=$1 FOR UPDATE`, [id]);
      if (!c) throw new NotFoundException('Không có command.');
      if (['ACK', 'FAILED', 'TIMED_OUT', 'CANCELLED'].includes(c.status)) {
        throw new ConflictException(`Không thể hủy lệnh đang ở trạng thái ${c.status}.`);
      }
      const [updated] = await q.query(
        `WITH updated AS (
           UPDATE device_commands c 
           SET status='CANCELLED' 
           WHERE id=$1 
           RETURNING c.*, c.id AS command_id
         ) 
         SELECT u.*, d.code AS device_code 
         FROM updated u 
         JOIN devices d ON d.id=u.device_id`,
        [id]
      );
      return updated;
    });
  }

  async claim(ref: string) {
    const d = await this.devices.resolve(ref);
    await this.expire();
    return this.db.transaction(async q => {
      await q.query(`SELECT id FROM devices WHERE id=$1 FOR UPDATE`, [d.id]);
      // PostgreSQL SKIP LOCKED prevents two workers from claiming the same rows.
      const rows = await q.query(
        `WITH picked AS (
           SELECT id FROM device_commands 
           WHERE device_id=$1 AND status='QUEUED' AND expires_at>now() 
           ORDER BY sequence LIMIT 20 FOR UPDATE SKIP LOCKED
         ), claimed AS (
           UPDATE device_commands c 
           SET status='SENT', sent_at=now() 
           FROM picked WHERE c.id=picked.id 
           RETURNING c.*, c.id AS command_id
         ) 
         SELECT * FROM claimed ORDER BY sequence`,
        [d.id]
      );
      rows.sort((a: any, b: any) => Number(a.sequence) - Number(b.sequence));
      return { commands: rows.map((c: any) => ({ ...c, sequence: Number(c.sequence), device_code: d.code })) };
    });
  }

  async ack(b: AckDto) {
    const d = await this.devices.resolve(b.device_id);
    if (b.device_code && b.device_code !== d.code) throw new BadRequestException('device_code không khớp.');

    return this.db.transaction(async q => {
      await q.query(`SELECT id FROM devices WHERE id=$1 FOR UPDATE`, [d.id]);
      const [c] = await q.query(`SELECT * FROM device_commands WHERE id=$1 FOR UPDATE`, [b.command_id]);
      if (!c) throw new NotFoundException('Không có command.');
      if (c.device_id !== d.id) throw new BadRequestException('ACK sai thiết bị.');
      if (b.sequence !== undefined && b.sequence !== Number(c.sequence)) throw new BadRequestException('ACK sai sequence.');

      // Lưu trạng thái mô phỏng riêng biệt nếu simulator gửi kèm (dùng để kiểm thử mất ACK chính xác)
      if (b.simulated_state && b.simulated_state[c.command_type]) {
        const hasSimCol = await q.query(`SELECT 1 FROM information_schema.columns WHERE table_name='device_states' AND column_name='simulated_state'`);
        if (hasSimCol && hasSimCol.length > 0) {
          await q.query(
            `UPDATE device_states SET simulated_state=$2 WHERE device_id=$1 AND command_type=$3`,
            [d.id, b.simulated_state[c.command_type], c.command_type]
          );
        }
      }

      if (c.ack_payload) {
        if (c.ack_payload.status !== b.status) throw new ConflictException('ACK mới mâu thuẫn ACK đã lưu.');
        return { ok: true, duplicate: true, command_id: c.id, status: c.status };
      }

      if (c.status === 'PENDING' || c.status === 'QUEUED') throw new ConflictException('Command chưa được thiết bị claim/SENT.');

      const late = ['TIMED_OUT', 'CANCELLED'].includes(c.status) || new Date(c.expires_at).getTime() <= Date.now();
      if (late) {
        await q.query(`UPDATE device_commands SET status=CASE WHEN status='SENT' THEN 'TIMED_OUT' ELSE status END WHERE id=$1`, [c.id]);
        await q.query(
          `INSERT INTO device_events(id,device_id,command_id,event_type,payload) VALUES($1,$2,$3,'LATE_ACK',$4::jsonb) ON CONFLICT(command_id,event_type) DO NOTHING`,
          [randomUUID(), d.id, c.id, JSON.stringify(b)]
        );
        return { ok: true, late: true, applied: false };
      }

      if (c.status !== 'SENT') throw new ConflictException('Không thể ACK trạng thái ' + c.status);
      if (b.status === 'SUCCESS' && b.actual_state?.[c.command_type] !== c.action) {
        throw new BadRequestException('ACK SUCCESS phải có actual_state khớp action của command.');
      }

      const status = b.status === 'SUCCESS' ? 'ACK' : 'FAILED';
      await q.query(`UPDATE device_commands SET status=$2, acknowledged_at=now(), ack_payload=$3::jsonb WHERE id=$1`, [
        c.id,
        status,
        JSON.stringify(b)
      ]);

      if (status === 'ACK') {
        await q.query(
          `UPDATE device_states 
           SET actual_state=$3, actual_sequence=$4, confirmed_at=now() 
           WHERE device_id=$1 AND command_type=$2 AND actual_sequence < $4`,
          [d.id, c.command_type, c.action, c.sequence]
        );
      }

      await q.query(`UPDATE devices SET last_seen=now() WHERE id=$1`, [d.id]);
      await q.query(
        `INSERT INTO device_events(id,device_id,command_id,event_type,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(command_id,event_type) DO NOTHING`,
        [randomUUID(), d.id, c.id, status, JSON.stringify(b)]
      );

      return { ok: true, command_id: c.id, status };
    });
  }

  async expire() {
    const rows = await this.db.query(
      `WITH expired AS (
         UPDATE device_commands 
         SET status='TIMED_OUT' 
         WHERE status IN ('PENDING','QUEUED','SENT') AND expires_at<=now() 
         RETURNING id AS command_id, device_id
       ) 
       SELECT * FROM expired`
    );
    return { expired: rows.length, commands: rows };
  }

  async manual(b: ManualDto) {
    await this.devices.resolve(b.device_id);
    const url = process.env.N8N_AUTOMATION_WEBHOOK_URL;
    if (!url) throw new ServiceUnavailableException('Chưa cấu hình webhook flow 03. Yêu cầu thủ công chưa được gửi.');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.N8N_TOKEN ? { authorization: 'Bearer ' + process.env.N8N_TOKEN } : {})
        },
        body: JSON.stringify({ ...b, request_id: randomUUID(), source: 'MANUAL' }),
        signal: AbortSignal.timeout(7000),
        redirect: 'error'
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      await r.body?.cancel();
      return { accepted: true, message: 'Webhook đã nhận yêu cầu, chờ command và ACK.' };
    } catch (e) {
      throw new ServiceUnavailableException('Không gửi được tới flow 03: ' + (e as Error).message);
    }
  }
}
