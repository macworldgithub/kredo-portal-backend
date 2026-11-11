import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, Min, Matches, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
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
  @IsOptional()
  @IsString()
  @IsIn(['Craig', 'Martin', 'George', 'Anderson', 'Elin'])
  author?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
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
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  settlementAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  statusUpdateAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;
}

class UpdateDealDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  applicant?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  lender?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  financedAmount?: number;
}


class CreateFollowUpReminderDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['Craig', 'Martin', 'George', 'Anderson', 'Elin'])
  author: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  comment: string;

  @IsString()
  @IsNotEmpty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dueTime: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

class UpdateFollowUpReminderDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
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

  @IsOptional()
  @IsString()
  abn?: string;

  @IsOptional()
  @IsString()
  commissionRate?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  bsb?: string;

  @IsOptional()
  @IsString()
  accountName?: string;
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
  phone?: string;

  @IsOptional()
  @IsString()
  abn?: string;

  @IsOptional()
  @IsString()
  commissionRate?: string;

  @IsOptional()
  @IsString()
  partnerType?: string;

  @IsOptional()
  @IsString()
  uniqueCode?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  bsb?: string;

  @IsOptional()
  @IsString()
  accountName?: string;
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

  @Patch('deals/:id')
  @UseGuards(JwtAuthGuard)
  async updateDeal(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.portalService.updateDeal(req.user, id, dto);
  }

  @Patch('deals/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async updateDealStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDealStatusDto) {
    return this.portalService.updateDealStatus(req.user, id, dto.status as any, dto.lostReason);
  }

  
  @Post('deals/:id/reminders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async addFollowUpReminder(@Req() req: any, @Param('id') id: string, @Body() dto: CreateFollowUpReminderDto) {
    return this.portalService.addFollowUpReminder(req.user, id, dto);
  }

  @Patch('deals/:id/reminders/:reminderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async updateFollowUpReminder(
    @Req() req: any,
    @Param('id') id: string,
    @Param('reminderId') reminderId: string,
    @Body() dto: UpdateFollowUpReminderDto,
  ) {
    return this.portalService.updateFollowUpReminder(req.user, id, reminderId, dto.completed ?? true);
  }

  @Post('deals/:id/notes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async addDiaryNote(@Req() req: any, @Param('id') id: string, @Body() dto: CreateDiaryNoteDto) {
    return this.portalService.addDiaryNote(req.user, id, dto);
  }

  @Patch('deals/:id/status-seen')
  @UseGuards(JwtAuthGuard)
  async markStatusSeen(@Req() req: any, @Param('id') id: string) {
    return this.portalService.markStatusSeen(req.user, id);
  }

  @Patch('deals/:id/notes/:noteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async updateDiaryNote(@Req() req: any, @Param('id') id: string, @Param('noteId') noteId: string, @Body() dto: CreateDiaryNoteDto) {
    return this.portalService.updateDiaryNote(req.user, id, noteId, dto);
  }

  @Post('deals/direct')
  @UseGuards(JwtAuthGuard)
  async createDirectReferral(@Req() req: any, @Body() dto: CreateDirectReferralDto) {
    return this.portalService.createDirectReferral(req.user, dto);
  }

  @Get('commissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
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
