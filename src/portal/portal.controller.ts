import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/role.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PortalService } from './portal.service.js';

class UpdateDealStatusDto {
  @IsString()
  @IsIn([
    'Lead received',
    'Customer invited',
    'Application submitted',
    'Waiting on customer',
    'In assessment',
    'Approved',
    'Docs / settlement',
    'Settled',
    'Declined',
    'Closed Lost',
    'Application received',
    'Declined / withdrawn',
  ])
  status: string;

  @IsOptional()
  @IsString()
  lostReason?: string;
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

class CreateDiaryNoteDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  nextSteps?: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

class UpdateCommissionDto {
  @IsOptional()
  @IsString()
  @IsIn(['Confirmed', 'Paid', 'Processing'])
  status?: 'Confirmed' | 'Paid' | 'Processing';

  @IsOptional()
  @IsString()
  commissionAmount?: string;

  @IsOptional()
  @IsString()
  paidDate?: string;

  @IsOptional()
  @IsString()
  rate?: string;
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

class UpdateMasterPartnerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  partnerType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  phone?: string;
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

class DirectorDetailDto {
  @IsOptional()
  @IsString()
  salutation?: string;

  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectorDetailDto)
  directors?: DirectorDetailDto[];

  @IsOptional()
  @IsString()
  referralCode?: string;
}

class CreateContactRequestDto {
  @IsString()
  businessName: string;

  @IsString()
  contactName: string;

  @IsString()
  phone: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateMasterPreferencesDto {
  @IsBoolean()
  weeklyReportsEnabled: boolean;
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
  async getDeals(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('stage') stage?: string,
    @Query('partnerCode') partnerCode?: string,
  ) {
    return this.portalService.getDeals(req.user, search, stage, partnerCode);
  }

  @Get('deals/:id')
  @UseGuards(JwtAuthGuard)
  async getDeal(@Req() req: any, @Param('id') id: string) {
    return this.portalService.getDealById(req.user, id);
  }

  @Patch('deals/:id/status')
  @UseGuards(JwtAuthGuard)
  async updateDealStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDealStatusDto) {
    return this.portalService.updateDealStatus(req.user, id, dto.status as any, dto.lostReason);
  }

  @Post('deals/:id/notes')
  @UseGuards(JwtAuthGuard)
  async addDiaryNote(@Req() req: any, @Param('id') id: string, @Body() dto: CreateDiaryNoteDto) {
    return this.portalService.addDiaryNote(req.user, id, dto);
  }

  @Post('deals/direct')
  @UseGuards(JwtAuthGuard)
  async createDirectReferral(@Req() req: any, @Body() dto: CreateDirectReferralDto) {
    return this.portalService.createDirectReferral(req.user, dto);
  }

  @Get('commissions')
  @UseGuards(JwtAuthGuard)
  async getCommissions(@Req() req: any) {
    return this.portalService.getCommissions(req.user);
  }

  @Patch('commissions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async updateCommission(@Param('id') id: string, @Body() dto: UpdateCommissionDto) {
    return this.portalService.updateCommission(id, dto);
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

  @Post('contact-request')
  async createContactRequest(@Body() dto: CreateContactRequestDto) {
    return this.portalService.createContactRequest(dto);
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

  @Get('master/pipeline-stages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async getMasterPipelineStages() {
    return this.portalService.getMasterPipelineStages();
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

  @Get('master/preferences')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async getMasterPreferences(@Req() req: any) {
    return this.portalService.getMasterPreferences(req.user);
  }

  @Patch('master/preferences')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async updateMasterPreferences(@Req() req: any, @Body() dto: UpdateMasterPreferencesDto) {
    return this.portalService.updateMasterPreferences(req.user, dto.weeklyReportsEnabled);
  }

  @Post('master/partners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async addPartner(@Body() dto: CreatePartnerDto) {
    return this.portalService.addPartner(dto);
  }

  @Patch('master/partners/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async updatePartner(@Param('code') code: string, @Body() dto: UpdateMasterPartnerDto) {
    return this.portalService.updateMasterPartner(code, dto);
  }

  @Delete('master/partners/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async deletePartner(@Param('code') code: string) {
    return this.portalService.deleteMasterPartner(code);
  }
}
