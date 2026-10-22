import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const TYPES = ['FAN', 'LIGHT', 'VENTILATION', 'DEHUMIDIFIER'] as const;
export const ROLES = ['VIEWER', 'OPERATOR', 'ADMIN'] as const;

export class DeviceDto {
  @ApiProperty({ example: 'ESP32_A101' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  device_id!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  device_code?: string;
}

export class TelemetryDto extends DeviceDto {
  @ApiProperty() @IsUUID() event_id!: string;
  @ApiProperty() @IsUUID() run_id!: string;
  @ApiProperty() @IsInt() @Min(0) sequence!: number;
  @ApiProperty() @IsDateString() observed_at!: string;
  @ApiProperty() @IsNumber() @Min(-10) @Max(60) temperature!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) humidity!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) light_percent!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(100) occupancy_count!: number;
  @ApiProperty() @IsNumber() @Min(300) @Max(5000) co2_ppm!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(20000) power_w!: number;
  @ApiProperty() @IsBoolean() door_open!: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() simulated?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() occupancy?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() room?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() room_code?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(4095) light_raw?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @IsIn([2]) schema_version?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsObject() actual_state?: Record<string, string>;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) @Max(500) pm25_ug_m3?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) @Max(100) water_l_min?: number;
}

export class CommandDto extends DeviceDto {
  @ApiProperty({ enum: TYPES }) @IsIn(TYPES) command_type!: string;
  @ApiProperty({ enum: ['ON', 'OFF'] }) @IsIn(['ON', 'OFF']) action!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(180) idempotency_key!: string;
  @ApiProperty({ enum: ['AUTO', 'MANUAL', 'TEST'] }) @IsIn(['AUTO', 'MANUAL', 'TEST']) source!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() decision_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(5) @Max(300) ttl_seconds?: number;
}

export class ManualDto extends DeviceDto {
  @ApiProperty({ enum: TYPES }) @IsIn(TYPES) command_type!: string;
  @ApiProperty({ enum: ['ON', 'OFF'] }) @IsIn(['ON', 'OFF']) action!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(120) override_minutes!: number;
}

export class AckDto extends DeviceDto {
  @ApiProperty() @IsUUID() command_id!: string;
  @ApiProperty({ enum: ['SUCCESS', 'FAILED'] }) @IsIn(['SUCCESS', 'FAILED']) status!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsObject() actual_state?: Record<string, string>;
  @ApiProperty({ required: false }) @IsOptional() @IsObject() simulated_state?: Record<string, string>;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) sequence?: number;
}

export class DecisionDto extends DeviceDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() telemetry_id?: string;
  @ApiProperty({ enum: ['AI', 'RULE', 'MANUAL'] }) @IsIn(['AI', 'RULE', 'MANUAL']) source!: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
  @ApiProperty() @IsObject() actions!: Record<string, unknown>;
  @ApiProperty({ required: false }) @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}

export class IngestionErrorDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() device_code?: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsObject() raw_payload?: Record<string, unknown>;
}

export class PaginationDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class PolicyUpdateDto {
  @ApiProperty()
  @IsObject()
  config!: Record<string, unknown>;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ProposalDto extends DeviceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  telemetry_id?: string;

  @ApiProperty({ example: 'WF07_ENVIRONMENT' })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty()
  @IsObject()
  desired_state!: Record<string, unknown>;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ example: '2026-10-22T20:00:00.000Z' })
  @IsDateString()
  expires_at!: string;
}

export class OverrideDto extends DeviceDto {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  command_type!: string;

  @ApiProperty({ enum: ['ON', 'OFF'] })
  @IsIn(['ON', 'OFF'])
  action!: string;

  @ApiProperty({ default: 30 })
  @IsInt()
  @Min(1)
  @Max(120)
  override_minutes: number = 30;
}

export class ScheduleDto {
  @ApiProperty()
  @IsUUID()
  room_id!: string;

  @ApiProperty({ example: 'Tiết 1 Buổi sáng' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 1, description: '0=Chủ nhật, 1=Thứ hai,...' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '07:00:00' })
  @IsString()
  @IsNotEmpty()
  starts_at!: string;

  @ApiProperty({ example: '09:00:00' })
  @IsString()
  @IsNotEmpty()
  ends_at!: string;
}

export class SimulationRunDto extends DeviceDto {
  @ApiProperty({ example: 'morning_rush' })
  @IsString()
  @IsNotEmpty()
  scenario!: string;

  @ApiProperty({ required: false, enum: ['STOPPED', 'RUNNING', 'PAUSED'], default: 'RUNNING' })
  @IsOptional()
  @IsIn(['STOPPED', 'RUNNING', 'PAUSED'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class SimulationConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telemetry_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  heartbeat_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ack_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  claim_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  sensors?: Record<string, unknown>;
}
