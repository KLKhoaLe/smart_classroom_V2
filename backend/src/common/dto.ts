import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export const TYPES=['FAN','LIGHT','VENTILATION','DEHUMIDIFIER'];
export class DeviceDto {
 @ApiProperty({example:'ESP32_A101'}) @IsString() @IsNotEmpty() @MaxLength(100) device_id!:string;
 @ApiProperty({required:false}) @IsOptional() @IsString() device_code?:string;
}
export class TelemetryDto extends DeviceDto {
 @ApiProperty() @IsUUID() event_id!:string;
 @ApiProperty() @IsUUID() run_id!:string;
 @ApiProperty() @IsInt() @Min(0) sequence!:number;
 @ApiProperty() @IsDateString() observed_at!:string;
 @ApiProperty() @IsNumber() @Min(-10) @Max(60) temperature!:number;
 @ApiProperty() @IsNumber() @Min(0) @Max(100) humidity!:number;
 @ApiProperty() @IsNumber() @Min(0) @Max(100) light_percent!:number;
 @ApiProperty() @IsInt() @Min(0) @Max(100) occupancy_count!:number;
 @ApiProperty() @IsNumber() @Min(300) @Max(5000) co2_ppm!:number;
 @ApiProperty() @IsNumber() @Min(0) @Max(20000) power_w!:number;
 @ApiProperty() @IsBoolean() door_open!:boolean;
 @ApiProperty({required:false}) @IsOptional() @IsBoolean() simulated?:boolean;
 @ApiProperty({required:false}) @IsOptional() @IsBoolean() occupancy?:boolean;
 @ApiProperty({required:false}) @IsOptional() @IsString() room?:string;
 @ApiProperty({required:false}) @IsOptional() @IsString() room_code?:string;
 @ApiProperty({required:false}) @IsOptional() @IsInt() @Min(0) @Max(4095) light_raw?:number;
 @ApiProperty({required:false}) @IsOptional() @IsInt() @IsIn([2]) schema_version?:number;
 @ApiProperty({required:false}) @IsOptional() @IsObject() actual_state?:Record<string,string>;
 @ApiProperty({required:false}) @IsOptional() @IsNumber() @Min(0) @Max(500) pm25_ug_m3?:number;
 @ApiProperty({required:false}) @IsOptional() @IsNumber() @Min(0) @Max(100) water_l_min?:number;
}
export class CommandDto extends DeviceDto {
 @ApiProperty() @IsIn(TYPES) command_type!:string;
 @ApiProperty() @IsIn(['ON','OFF']) action!:string;
 @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(180) idempotency_key!:string;
 @ApiProperty() @IsIn(['AUTO','MANUAL','TEST']) source!:string;
 @ApiProperty({required:false}) @IsOptional() @IsUUID() decision_id?:string;
 @ApiProperty({required:false}) @IsOptional() @IsInt() @Min(5) @Max(300) ttl_seconds?:number;
}
export class ManualDto extends DeviceDto {
 @ApiProperty() @IsIn(TYPES) command_type!:string;
 @ApiProperty() @IsIn(['ON','OFF']) action!:string;
 @ApiProperty() @IsInt() @Min(1) @Max(120) override_minutes!:number;
}
export class AckDto extends DeviceDto {
 @ApiProperty() @IsUUID() command_id!:string;
 @ApiProperty() @IsIn(['SUCCESS','FAILED']) status!:string;
 @ApiProperty({required:false}) @IsOptional() @IsObject() actual_state?:Record<string,string>;
 @ApiProperty({required:false}) @IsOptional() @IsString() @MaxLength(1000) message?:string;
 @ApiProperty({required:false}) @IsOptional() @IsInt() @Min(0) sequence?:number;
}
export class DecisionDto extends DeviceDto {
 @ApiProperty({required:false}) @IsOptional() @IsUUID() telemetry_id?:string;
 @ApiProperty() @IsIn(['AI','RULE','MANUAL']) source!:string;
 @ApiProperty() @IsString() @IsNotEmpty() reason!:string;
 @ApiProperty() @IsObject() actions!:Record<string,unknown>;
 @ApiProperty({required:false}) @IsOptional() @IsObject() evidence?:Record<string,unknown>;
}
export class IngestionErrorDto {
 @ApiProperty({required:false}) @IsOptional() @IsString() device_code?:string;
 @ApiProperty() @IsString() @IsNotEmpty() reason!:string;
 @ApiProperty({required:false}) @IsOptional() @IsObject() raw_payload?:Record<string,unknown>;
}

export class IncidentCandidateDto {
 @ApiProperty({required:false}) @IsOptional() @IsString() device_id?:string;
 @ApiProperty({required:false}) @IsOptional() @IsString() room?:string;
 @ApiProperty() @IsString() @MaxLength(80) type!:string;
 @ApiProperty() @IsString() @MaxLength(20) severity!:string;
 @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(250) title!:string;
 @ApiProperty({required:false}) @IsOptional() @IsString() @MaxLength(180) dedup_key?:string;
 @ApiProperty({required:false}) @IsOptional() @IsDateString() observed_at?:string;
 @ApiProperty({required:false}) @IsOptional() @IsObject() details?:Record<string,unknown>;
}
export class IncidentUpdateDto {
 @ApiProperty({required:false}) @IsOptional() @IsIn(['OPEN','ACKNOWLEDGED','RESOLVED']) status?:string;
 @ApiProperty({required:false}) @IsOptional() @IsIn(['INFO','WARNING','CRITICAL']) severity?:string;
 @ApiProperty({required:false}) @IsOptional() @IsString() @MaxLength(150) assigned_to?:string;
}
export class ReportSaveDto {
 @ApiProperty() @IsString() room!:string;
 @ApiProperty() @IsIn(['DAILY','WEEKLY']) type!:string;
 @ApiProperty() @IsDateString() period_start!:string;
 @ApiProperty() @IsDateString() period_end!:string;
 @ApiProperty({required:false}) @IsOptional() @IsObject() metrics?:Record<string,unknown>;
 @ApiProperty({required:false}) @IsOptional() @IsString() @MaxLength(5000) summary?:string;
 @ApiProperty({required:false}) @IsOptional() @IsIn(['DRAFT','APPROVED','REJECTED']) status?:string;
}
export class WeeklyReportSaveDto {
 @ApiProperty() @IsDateString() period_start!:string;
 @ApiProperty() @IsDateString() period_end!:string;
 @ApiProperty({required:false}) @IsOptional() @IsObject() metrics?:Record<string,unknown>;
 @ApiProperty({required:false}) @IsOptional() @IsString() @MaxLength(5000) summary?:string;
}
export class ReportDecisionDto { @ApiProperty() @IsIn(['APPROVED','REJECTED']) status!:string; }
