import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncidentEventReceiptsV31792800000000
  implements MigrationInterface
{
  name = 'IncidentEventReceiptsV31792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE incident_event_receipts (
        event_key varchar(250) PRIMARY KEY,
        fingerprint varchar(64) NOT NULL,
        incident_id uuid
          REFERENCES incidents(id)
          ON DELETE SET NULL,
        result jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX incident_event_receipts_incident_time
      ON incident_event_receipts (incident_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE incident_event_receipts
    `);
  }
}