feat/incident-report-workflows
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { Body, Controller, Delete, Get, Optional, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
main
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { DeviceService } from './device.service';
import { TelemetryService } from './telemetry.service';
import { CommandsService } from './commands.service';
import { DashboardService } from './dashboard.service';
feat/incident-report-workflows
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
import { AuthService } from './auth.service';
import { Roles } from '../common/roles.decorator';
import {
  TelemetryDto,
  DeviceDto,
  CommandDto,
  AckDto,
  ManualDto,
  IngestionErrorDto,
  DecisionDto,
  PaginationDto,
  LoginDto,
  PolicyUpdateDto,
  OverrideDto,
  ProposalDto,
  ScheduleDto,
  SimulationRunDto
} from '../common/dto';

@ApiTags('Smart Classroom Backend v2 — Quang Vinh')
@ApiBearerAuth()
@Controller()
export class ApiController {
  constructor(
    private readonly db: DataSource,
    private readonly devices: DeviceService,
    private readonly telemetry: TelemetryService,
    private readonly commands: CommandsService,
    private readonly dashboard: DashboardService,
    @Optional() private readonly auth?: AuthService
  ) {}

  //  1. HEALTH & AUTH 
  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { ok: true, database: 'connected', schema: 'migrated' };
  }

  @Post('auth/login')
  login(@Body() b: LoginDto) {
    if (!this.auth) return { ok: false, message: 'Auth service not configured' };
    return this.auth.login(b);
  }

  @Get('auth/me')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  me(@Req() req: any) {
    return { ok: true, user: req.user };
  }

  //  2. ROOMS & DEVICES 
  @Get('rooms')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  rooms() {
    return this.devices.rooms();
  }

  @Get('devices')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  listDevices() {
    return this.devices.list();
  }

  @Post('devices/heartbeat')
  @Roles('OPERATOR', 'ADMIN')
  heartbeat(@Body() b: DeviceDto) {
    return this.devices.heartbeat(b.device_id);
  }

  @Post('devices/check-offline')
  @Roles('OPERATOR', 'ADMIN')
  offline() {
    return this.devices.offline();
  }

  @Get('devices/:ref/states')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  states(@Param('ref') ref: string) {
    return this.devices.states(ref);
  }

  //  3. TELEMETRY 
  @Post('telemetry')
  @Roles('OPERATOR', 'ADMIN')
  ingest(@Body() b: TelemetryDto) {
    return this.telemetry.create(b);
  }

  @Get('telemetry')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  telemetryList(@Query() q: PaginationDto, @Query('device_id') id?: string) {
    return this.telemetry.list(id || q.device_id, q);
  }

  @Post('ingestion-errors')
  @Roles('OPERATOR', 'ADMIN')
  error(@Body() b: IngestionErrorDto) {
    return this.telemetry.error(b);
  }

  @Post('decisions')
  @Roles('OPERATOR', 'ADMIN')
  decision(@Body() b: DecisionDto) {
    return this.telemetry.decision(b);
  }

  //  4. COMMANDS 
  @Post('commands')
  @Roles('OPERATOR', 'ADMIN')
  create(@Body() b: CommandDto) {
    return this.commands.create(b);
  }

  @Get('commands')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  commandsList(@Query() q: PaginationDto) {
    return this.commands.list(q);
  }

  @Get('commands/:id/status')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.commands.get(id);
  }

  @Post('commands/:id/dispatch')
  @Roles('OPERATOR', 'ADMIN')
  dispatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.commands.dispatch(id);
  }

  @Post('commands/:id/cancel')
  @Roles('OPERATOR', 'ADMIN')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.commands.cancel(id);
  }

  @Post('commands/claim')
  @Roles('OPERATOR', 'ADMIN')
  claim(@Body() b: DeviceDto) {
    return this.commands.claim(b.device_id);
  }

  @Post('commands/ack')
  @Roles('OPERATOR', 'ADMIN')
  ack(@Body() b: AckDto) {
    return this.commands.ack(b);
  }

  @Post('commands/expire')
  @Roles('OPERATOR', 'ADMIN')
  expire() {
    return this.commands.expire();
  }

  @Post('commands/manual')
  @Roles('OPERATOR', 'ADMIN')
  manual(@Body() b: ManualDto) {
    return this.commands.manual(b);
  }

  //  5. POLICIES 
  @Get('policies/:room')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  policy(@Param('room') room: string) {
    return this.devices.policy(room);
  }

  @Get('policies')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  listPolicies(@Query('room') room?: string) {
    return this.devices.listPolicies(room);
  }

  @Post('policies/:room')
  @Roles('ADMIN')
  createPolicy(@Param('room') room: string, @Body() b: PolicyUpdateDto) {
    return this.devices.createPolicy(room, b);
  }

  //  6. MANUAL OVERRIDES 
  @Get('overrides')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  getOverrides(@Query('room') room?: string) {
    return this.devices.getOverrides(room);
  }

  @Post('overrides')
  @Roles('OPERATOR', 'ADMIN')
  setOverride(@Body() b: OverrideDto) {
    return this.devices.setOverride(b);
  }

  @Delete('overrides/:ref/:type')
  @Roles('OPERATOR', 'ADMIN')
  clearOverride(@Param('ref') ref: string, @Param('type') type: string) {
    return this.devices.clearOverride(ref, type);
  }

  //  7. CONTROL PROPOSALS (WF07-09) 
  @Get('proposals')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  listProposals(@Query('device_id') deviceId?: string) {
    return this.devices.listProposals(deviceId);
  }

  @Post('proposals')
  @Roles('OPERATOR', 'ADMIN')
  createProposal(@Body() b: ProposalDto) {
    return this.devices.createProposal(b);
  }

  //  8. SCHEDULES 
  @Get('schedules/:room')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  getSchedules(@Param('room') room: string) {
    return this.devices.getSchedules(room);
  }

  @Post('schedules')
  @Roles('ADMIN')
  createSchedule(@Body() b: ScheduleDto) {
    return this.devices.createSchedule(b);
  }

  //  9. SIMULATION RUNS (Worker Khoa) 
  @Get('simulation/runs')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  getSimulationRuns(@Query('device_id') deviceId?: string) {
    return this.devices.getSimulationRuns(deviceId);
  }

  @Post('simulation/runs')
  @Roles('OPERATOR', 'ADMIN')
  createSimulationRun(@Body() b: SimulationRunDto) {
    return this.devices.createSimulationRun(b);
  }

  @Patch('simulation/runs/:id')
  @Roles('OPERATOR', 'ADMIN')
  updateSimulationRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
    @Body('config') config?: Record<string, unknown>
  ) {
    return this.devices.updateSimulationRun(id, status, config);
  }

  //  10. DASHBOARD & INCIDENTS & REPORTS 
  @Get('dashboard')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  overview() {
    return this.dashboard.get();
  }

  @Get('incidents')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  incidents() {
    return this.dashboard.incidents();
  }

  @Get('reports')
  @Roles('VIEWER', 'OPERATOR', 'ADMIN')
  reports() {
    return this.dashboard.reports();
  }
  main
}
