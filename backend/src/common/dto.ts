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
