import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DashboardService {
  constructor(private readonly db: DataSource) {}

  async get() {
    const devices = await this.db.query(
      `SELECT d.id, d.code, d.name, r.code AS room_code, d.last_seen,
              (d.last_seen > now() - interval '90 seconds') IS TRUE AS online,
              t.id AS telemetry_id, t.temperature, t.humidity, t.co2_ppm, t.light_percent, 
              t.occupancy_count, t.power_w, t.door_open, t.observed_at,
              ROUND(EXTRACT(EPOCH FROM (now() - t.observed_at))) AS freshness_seconds,
              (EXTRACT(EPOCH FROM (now() - t.observed_at)) > 30) IS TRUE AS is_stale
       FROM devices d 
       JOIN rooms r ON r.id = d.room_id 
       LEFT JOIN LATERAL (
         SELECT * FROM telemetry 
         WHERE device_id = d.id 
         ORDER BY observed_at DESC, sequence DESC 
         LIMIT 1
       ) t ON true 
       ORDER BY d.code`
    );

    const states = await this.db.query(`SELECT * FROM device_states ORDER BY command_type`);

    const [stats] = await this.db.query(
      `SELECT (SELECT count(*)::int FROM telemetry) AS telemetry_count,
              (SELECT count(*)::int FROM device_commands WHERE status IN ('PENDING','QUEUED','SENT')) AS pending_commands,
              (SELECT count(*)::int FROM incidents WHERE status <> 'RESOLVED') AS open_incidents,
              (SELECT count(*)::int FROM manual_overrides WHERE expires_at > now()) AS active_overrides`
    );

    const decisions = await this.db.query(
      `SELECT ad.*, d.code AS device_code 
       FROM automation_decisions ad 
       JOIN devices d ON d.id = ad.device_id 
       ORDER BY ad.created_at DESC LIMIT 5`
    );

    const overrides = await this.db.query(
      `SELECT o.*, d.code AS device_code 
       FROM manual_overrides o 
       JOIN devices d ON d.id = o.device_id 
       WHERE o.expires_at > now()`
    );

    return {
      devices: devices.map((d: any) => {
        const deviceStates = states
          .filter((s: any) => s.device_id === d.id)
          .map((s: any) => ({
            ...s,
            in_sync: s.desired_state === s.actual_state && (s.desired_level == null || s.desired_level === s.actual_level)
          }));

        return {
          ...d,
          states: deviceStates
        };
      }),
      stats,
      decisions,
      active_overrides: overrides,
      server_time: new Date().toISOString(),
      manual_levels_enabled: true,
      manual_enabled: !!process.env.N8N_AUTOMATION_WEBHOOK_URL
    };
  }

  incidents() {
    return this.db.query(`SELECT * FROM incidents ORDER BY last_seen DESC LIMIT 100`);
  }

  reports() {
    return this.db.query(
      `SELECT r.*, rooms.code AS room_code 
       FROM reports r 
       JOIN rooms ON rooms.id=r.room_id 
       ORDER BY r.created_at DESC LIMIT 100`
    );
  }
}
