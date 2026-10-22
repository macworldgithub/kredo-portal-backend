import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/role.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PortalService } from './portal.service.js';

class UpdateDealStatusDto {
  @IsString()
  @IsIn(['In assessment', 'Approved', 'Docs / settlement', 'Settled', 'Declined'])
  status: string;
}

class CreateDirectReferralDto {
  @IsString()
  businessName: string;

  @IsString()
  contactName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  facilityType?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

class UpdateSettingsDto {
  @IsString()
  name: string;

  @IsEmail()
  contactEmail: string;

  @IsString()
  phone: string;

  @IsString()
  bankAccount: string;

  @IsString()
  bsb: string;

  @IsString()
  abn: string;

  @IsOptional()
  notificationsEnabled?: boolean;

  @IsOptional()
  settlementAlerts?: boolean;

  @IsOptional()
  marketingEmails?: boolean;
}

class CreatePartnerDto {
  @IsString()
  tradingName: string;

  @IsString()
  primaryContact: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  partnerType?: string;

  @IsOptional()
  @IsString()
  uniqueCode?: string;
}

class CreateApplicationDto {
  @IsString()
  tradingName: string;

  @IsString()
  abn: string;

  @IsString()
  amount: string;

  @IsString()
  purpose: string;

  @IsString()
  directorName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'kredo-portal-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboard(@Req() req: any) {
    return this.portalService.getDashboard(req.user);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    return this.portalService.getPartnerProfile(req.user);
  }

  @Get('deals')
  @UseGuards(JwtAuthGuard)
  async getDeals(@Query('search') search?: string, @Query('stage') stage?: string) {
    return this.portalService.getDeals(search, stage);
  }

  @Get('deals/:id')
  @UseGuards(JwtAuthGuard)
  async getDeal(@Param('id') id: string) {
    return this.portalService.getDealById(id);
  }

  @Patch('deals/:id/status')
  @UseGuards(JwtAuthGuard)
  async updateDealStatus(@Param('id') id: string, @Body() dto: UpdateDealStatusDto) {
    return this.portalService.updateDealStatus(id, dto.status as any);
  }

  @Post('deals/direct')
  @UseGuards(JwtAuthGuard)
  async createDirectReferral(@Body() dto: CreateDirectReferralDto) {
    return this.portalService.createDirectReferral(dto);
  }

  @Get('commissions')
  @UseGuards(JwtAuthGuard)
  async getCommissions() {
    return this.portalService.getCommissions();
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  async getSettings(@Req() req: any) {
    return this.portalService.getPartnerSettings(req.user);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    return this.portalService.updatePartnerSettings(req.user, dto);
  }

  @Post('applications')
  async createApplication(@Body() dto: CreateApplicationDto) {
    return this.portalService.createApplication(dto);
  }

  @Get('master/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async getMasterOverview() {
    return this.portalService.getMasterOverview();
  }

  @Get('master/pipeline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async getMasterPipeline() {
    return this.portalService.getMasterPipeline();
  }

  @Get('master/partners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async getMasterPartners() {
    return this.portalService.getPartnerDirectory();
  }

  @Get('master/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async getMasterReports() {
    return this.portalService.getMasterReports();
  }

  @Post('master/partners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async addPartner(@Body() dto: CreatePartnerDto) {
    return this.portalService.addPartner(dto);
  }
}
