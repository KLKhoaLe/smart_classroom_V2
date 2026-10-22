import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { TelemetryDto, IngestionErrorDto, DecisionDto, PaginationDto } from '../common/dto';
import { DeviceService } from './device.service';

@Injectable()
export class TelemetryService {
  constructor(private readonly db: DataSource, private readonly devices: DeviceService) {}

  async create(b: TelemetryDto) {
    const d = await this.devices.resolve(b.device_id);
    if (b.device_code && b.device_code !== d.code) throw new BadRequestException('device_id và device_code không khớp.');
    if ((b.room_code && b.room_code !== d.room_code) || (b.room && b.room !== d.room_code))
      throw new BadRequestException('Phòng không khớp thiết bị.');
    if (b.occupancy !== undefined && b.occupancy !== (b.occupancy_count > 0))
      throw new BadRequestException('occupancy mâu thuẫn occupancy_count.');
    if (Date.parse(b.observed_at) > Date.now() + 60000)
      throw new BadRequestException('Timestamp vượt quá 60 giây trong tương lai.');

    return this.db.transaction(async q => {
      const inserted = await q.query(
        `INSERT INTO telemetry(id,event_id,run_id,device_id,sequence,observed_at,temperature,humidity,light_percent,occupancy_count,co2_ppm,power_w,door_open,simulated,raw_payload) 
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) 
         ON CONFLICT(event_id) DO NOTHING RETURNING *`,
        [
          randomUUID(),
          b.event_id,
          b.run_id,
          d.id,
          b.sequence,
          b.observed_at,
          b.temperature,
          b.humidity,
          b.light_percent,
          b.occupancy_count,
          b.co2_ppm,
          b.power_w,
          b.door_open,
          b.simulated ?? true,
          JSON.stringify(b)
        ]
      );

      if (!inserted.length) {
        const [old] = await q.query(
          `SELECT *, raw_payload=$2::jsonb AS identical FROM telemetry WHERE event_id=$1`,
          [b.event_id, JSON.stringify(b)]
        );
        if (!old.identical) throw new ConflictException('event_id trùng nhưng dữ liệu khác.');
        delete old.identical;
        return { created: false, telemetry: old };
      }

      await q.query(`UPDATE devices SET last_seen=now() WHERE id=$1`, [d.id]);
      return { created: true, telemetry: inserted[0] };
    });
  }

  async list(device?: string, query?: PaginationDto) {
    const d = device ? await this.devices.resolve(device) : null;
    const deviceId = d?.id ?? null;

    // Nếu có tham số page được truyền vào -> trả về phân trang
    if (query?.page !== undefined || query?.limit !== undefined) {
      const page = Math.max(1, Number(query?.page || 1));
      const limit = Math.min(100, Math.max(1, Number(query?.limit || 20)));
      const offset = (page - 1) * limit;

      const [countRow] = await this.db.query(
        `SELECT count(*)::int AS total FROM telemetry WHERE ($1::uuid IS NULL OR device_id=$1)`,
        [deviceId]
      );
      const total = countRow?.total || 0;

      const items = await this.db.query(
        `SELECT t.*, d.code AS device_code 
         FROM telemetry t 
         JOIN devices d ON d.id=t.device_id 
         WHERE ($1::uuid IS NULL OR t.device_id=$1) 
         ORDER BY t.observed_at DESC, t.sequence DESC 
         LIMIT $2 OFFSET $3`,
        [deviceId, limit, offset]
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
      `SELECT t.*, d.code AS device_code 
       FROM telemetry t 
       JOIN devices d ON d.id=t.device_id 
       WHERE ($1::uuid IS NULL OR t.device_id=$1) 
       ORDER BY t.observed_at DESC, t.sequence DESC 
       LIMIT 100`,
      [deviceId]
    );
  }

  async error(b: IngestionErrorDto) {
    const [r] = await this.db.query(
      `INSERT INTO ingestion_errors(id,device_code,reason,raw_payload) 
       VALUES($1,$2,$3,$4::jsonb) 
       RETURNING *`,
      [randomUUID(), b.device_code ?? null, b.reason, JSON.stringify(b.raw_payload ?? {})]
    );
    return r;
  }

  async decision(b: DecisionDto) {
    const d = await this.devices.resolve(b.device_id);
    if (b.telemetry_id) {
      const [t] = await this.db.query(`SELECT id FROM telemetry WHERE id=$1 AND device_id=$2`, [b.telemetry_id, d.id]);
      if (!t) throw new BadRequestException('Telemetry không thuộc thiết bị.');
    }
    const [r] = await this.db.query(
      `INSERT INTO automation_decisions(id,device_id,telemetry_id,source,reason,actions,evidence) 
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) 
       RETURNING *`,
      [randomUUID(), d.id, b.telemetry_id ?? null, b.source, b.reason, JSON.stringify(b.actions), JSON.stringify(b.evidence ?? {})]
    );
    return r;
  }
}
