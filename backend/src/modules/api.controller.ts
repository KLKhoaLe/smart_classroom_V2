import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { DeviceService } from './device.service';
import { TelemetryService } from './telemetry.service';
import { CommandsService } from './commands.service';
import { DashboardService } from './dashboard.service';
import { IncidentReportService } from './incident-report.service';
import { TelemetryDto,DeviceDto,CommandDto,AckDto,ManualDto,IngestionErrorDto,DecisionDto,IncidentCandidateDto,IncidentUpdateDto,ReportSaveDto,ReportDecisionDto,WeeklyReportSaveDto } from '../common/dto';
@ApiTags('Smart Classroom foundation') @ApiBearerAuth()
@Controller()
export class ApiController {
 constructor(private readonly db:DataSource,private readonly devices:DeviceService,private readonly telemetry:TelemetryService,private readonly commands:CommandsService,private readonly dashboard:DashboardService,private readonly incidentReports:IncidentReportService){}
 @Get('health') async health(){await this.db.query('SELECT 1');return {ok:true,database:'connected',schema:'migrated'};}
 @Get('rooms') rooms(){return this.devices.rooms();}
 @Get('devices') listDevices(){return this.devices.list();}
 @Post('devices/heartbeat') heartbeat(@Body() b:DeviceDto){return this.devices.heartbeat(b.device_id);}
 @Post('devices/check-offline') offline(){return this.devices.offline();}
 @Get('devices/:ref/states') states(@Param('ref') ref:string){return this.devices.states(ref);}
 @Post('telemetry') ingest(@Body() b:TelemetryDto){return this.telemetry.create(b);}
 @Get('telemetry') telemetryList(@Query('device_id') id?:string){return this.telemetry.list(id);}
 @Post('ingestion-errors') error(@Body() b:IngestionErrorDto){return this.telemetry.error(b);}
 @Post('decisions') decision(@Body() b:DecisionDto){return this.telemetry.decision(b);}
 @Get('policies/:room') policy(@Param('room') room:string){return this.devices.policy(room);}
 @Post('commands/manual') manual(@Body() b:ManualDto){return this.commands.manual(b);}
 @Post('commands/claim') claim(@Body() b:DeviceDto){return this.commands.claim(b.device_id);}
 @Post('commands/ack') ack(@Body() b:AckDto){return this.commands.ack(b);}
 @Post('commands/expire') expire(){return this.commands.expire();}
 @Post('commands') create(@Body() b:CommandDto){return this.commands.create(b);}
 @Get('commands') commandsList(){return this.commands.list();}
 @Get('commands/:id/status') status(@Param('id',ParseUUIDPipe) id:string){return this.commands.get(id);}
 @Post('commands/:id/dispatch') dispatch(@Param('id',ParseUUIDPipe) id:string){return this.commands.dispatch(id);}
 @Get('dashboard') overview(){return this.dashboard.get();}
 @Get('incidents') incidents(@Query() q:any){return this.incidentReports.listIncidents(q);}
 @Post('incidents') incidentUpsert(@Body() b:IncidentCandidateDto){return this.incidentReports.upsertIncident(b);}
 @Get('notifications') notifications(){return this.incidentReports.notifications();}
 @Patch('notifications/:id/read') readNotification(@Param('id',ParseUUIDPipe) id:string){return this.incidentReports.readNotification(id);}
 @Get('incidents/:id') incident(@Param('id',ParseUUIDPipe) id:string){return this.incidentReports.detailIncident(id);}
 @Patch('incidents/:id') incidentUpdate(@Param('id',ParseUUIDPipe) id:string,@Body() b:IncidentUpdateDto){return this.incidentReports.updateIncident(id,b);}
 @Get('reports') reports(@Query() q:any){return this.incidentReports.listReports(q);}
 @Post('reports') saveReport(@Body() b:ReportSaveDto){return this.incidentReports.saveReport(b);}
 @Post('reports/daily/:room') dailyReport(@Param('room') room:string,@Query('date') date?:string){return this.incidentReports.aggregateDaily(room,date);}
 @Get('reports/weekly/context/:room') weeklyContext(@Param('room') room:string){return this.incidentReports.weeklyContext(room);}
 @Post('reports/weekly/:room') weeklyDraft(@Param('room') room:string,@Body() b:WeeklyReportSaveDto){return this.incidentReports.saveReport({...b,room,type:'WEEKLY',status:'DRAFT'});}
 @Get('reports/:id') report(@Param('id',ParseUUIDPipe) id:string){return this.incidentReports.report(id);}
 @Patch('reports/:id') updateReport(@Param('id',ParseUUIDPipe) id:string,@Body() b:ReportDecisionDto){return this.incidentReports.updateReport(id,b.status);}
}
