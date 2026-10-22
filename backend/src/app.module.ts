import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './database/database.module';
import { LocalGuard } from './common/local.guard';

import { DuongMonitoringModule } from './modules/duong-monitoring/monitoring.module';
import { AutomationModule } from './modules/automation/automation.module';

import { ApiController } from './modules/api.controller';
import { DeviceService } from './modules/device.service';
import { TelemetryService } from './modules/telemetry.service';
import { CommandsService } from './modules/commands.service';
import { DashboardService } from './modules/dashboard.service'; feat/incident-report-workflows
import { IncidentReportService } from './modules/incident-report.service';
@Module({imports:[AutomationModule,DatabaseModule],controllers:[ApiController],providers:[DeviceService,TelemetryService,CommandsService,DashboardService,IncidentReportService,{provide:APP_GUARD,useClass:LocalGuard}]})
export class AppModule {}
import { AuthService } from './modules/auth.service';

@Module({
  imports: [
    DuongMonitoringModule,
    AutomationModule,
    DatabaseModule
  ],
  controllers: [ApiController],
  providers: [
    DeviceService,
    TelemetryService,
    CommandsService,
    DashboardService,
    AuthService,
    { provide: APP_GUARD, useClass: LocalGuard }
  ]
})
export class AppModule {}
main
