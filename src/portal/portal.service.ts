import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../auth/user.schema.js';
import { Commission } from '../schemas/commission.schema.js';
import { Deal, DealStatus } from '../schemas/deal.schema.js';
import { Partner } from '../schemas/partner.schema.js';
import { Application } from '../schemas/application.schema.js';
import { ContactRequest } from '../schemas/contact-request.schema.js';
import { MailService } from '../auth/mail.service.js';

@Injectable()
export class PortalService {
  constructor(
    @InjectModel(Partner.name) private readonly partnerModel: Model<Partner>,
    @InjectModel(Deal.name) private readonly dealModel: Model<Deal>,
    @InjectModel(Commission.name) private readonly commissionModel: Model<Commission>,
    @InjectModel(Application.name) private readonly applicationModel: Model<Application>,
    @InjectModel(ContactRequest.name) private readonly contactRequestModel: Model<ContactRequest>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly mailService: MailService,
  ) {}

  private toNumber(value: string): number {
    return Number(String(value).replace(/[$,]/g, '').replace(/[^\d.-]/g, '')) || 0;
  }

  private parseAmount(value: string): number {
    const normalized = value.trim().replace(/^\$\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException('Enter a non-negative dollar amount with up to two decimal places');
    }
    const amount = Number(normalized.replaceAll(',', ''));
    if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER / 100) {
      throw new BadRequestException('Amount is too large');
    }
    return amount;
  }

  private formatAmount(amount: number): string {
    return `$${amount.toLocaleString('en-AU', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private async syncCommissionToDeal(commission: Commission) {
    const status = commission.status === 'Processing' ? 'Estimated' : commission.status;
    await this.dealModel.updateOne(
      { id: commission.dealId },
      { $set: { commission: commission.commissionAmount, commissionStatus: status } },
    );
  }

  private async ensureCommission(deal: Deal) {
    const financedAmount = deal.financedAmount ?? deal.amountValue;
    const commissionValue = this.toNumber(deal.commission);
    const rate = financedAmount > 0 ? (commissionValue / financedAmount) * 100 : 0;
    const commission = await this.commissionModel.findOneAndUpdate(
      { dealId: deal.id },
      {
        $set: {
          dealName: deal.name,
          client: deal.applicant,
          settledAmount: this.formatAmount(financedAmount),
          partnerCode: deal.code,
        },
        $setOnInsert: {
          dealId: deal.id,
          rate: `${rate.toFixed(2)}%`,
          commissionAmount: deal.commission,
          status: deal.commissionStatus === 'Paid' ? 'Paid' : 'Confirmed',
        },
      },
      { upsert: deal.status === 'Settled', returnDocument: 'after', runValidators: true },
    );
    if (commission) {
      await this.syncCommissionToDeal(commission);
      deal.commission = commission.commissionAmount;
      deal.commissionStatus = commission.status === 'Processing' ? 'Estimated' : commission.status;
    }
  }

  private mapDeal(doc: any, user?: any) {
    return {
      id: doc.id,
      name: doc.name,
      applicant: doc.applicant,
      amount: doc.amount,
      financedAmount: doc.financedAmount ?? undefined,
      type: doc.type,
      status: doc.status,
      lastActivity: doc.lastActivity,
      ...(user?.role === 'master' ? { commission: doc.commission, commissionStatus: doc.commissionStatus } : {}),
      code: doc.code,
      submittedDate: doc.submittedDate,
      lostReason: doc.lostReason ?? undefined,
      lender: doc.lender ?? undefined,
      statusUpdatedAt: doc.statusUpdatedAt ?? undefined,
      statusSeenAt: doc.statusSeenAt ?? undefined,
      diaryNotes: (doc.diaryNotes || []).filter((note: any) => user?.role === 'master' || !note.isInternal),
      ...(user?.role === 'master' ? { followUpReminders: doc.followUpReminders || [] } : {}),
    };
  }

  async markStatusSeen(user: any, id: string) {
    const query: Record<string, string> = { id };
    if (user.role === 'partner') query.code = user.partnerCode;
    const deal = await this.dealModel.findOne(query).exec();
    if (!deal) throw new NotFoundException('Deal not found');
    deal.statusSeenAt = deal.statusUpdatedAt || null;
    await deal.save();
    return this.mapDeal(deal, user);
  }

  async updateDiaryNote(user: any, dealId: string, noteId: string, dto: { author?: string; content: string; nextSteps?: string; isInternal?: boolean }) {
    const deal = await this.dealModel.findOne({ id: dealId }).exec();
    if (!deal) throw new NotFoundException('Deal not found');
    const note = deal.diaryNotes.find((item) => item.id === noteId);
    if (!note) throw new NotFoundException('Diary note not found');
    Object.assign(note, dto);
    deal.markModified('diaryNotes');
    await deal.save();
    return this.mapDeal(deal, user);
  }

  async getPartnerProfile(user: any) {
    const partnerCode = user.partnerCode || 'HAYES01';
    const partner = await this.partnerModel.findOne({ code: partnerCode }).exec();
    if (!partner) {
      throw new NotFoundException('Partner profile not found');
    }

    return {
      name: partner.name,
      code: partner.code,
      partnerType: partner.partnerType,
      contactEmail: partner.contactEmail,
      phone: partner.phone,
      bankAccount: partner.bankAccount,
      bsb: partner.bsb,
      abn: partner.abn,
      referralLink: partner.referralLink,
      notificationsEnabled: partner.notificationsEnabled,
      settlementAlerts: partner.settlementAlerts,
      statusUpdateAlerts: partner.statusUpdateAlerts ?? true,
      marketingEmails: partner.marketingEmails,
    };
  }

  async getDashboard(user: any) {
    const partner = await this.getPartnerProfile(user);
    const deals = await this.dealModel
      .find({ code: partner.code })
      .sort({ createdAt: -1 })
      .lean();

    const referredThisMonth = await this.dealModel.countDocuments({
      code: partner.code,
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    });

    const inFlight = await this.dealModel.countDocuments({
      code: partner.code,
      status: {
        $in: [
          'Lead received',
          'Customer invited',
          'Application submitted',
          'Waiting on customer',
          'In assessment',
          'Approved',
          'Docs / settlement',
          'Application received',
        ],
      },
    });

    const settled = await this.dealModel.countDocuments({
      code: partner.code,
      status: 'Settled',
    });

    const closedLost = await this.dealModel.countDocuments({
      code: partner.code,
      status: { $in: ['Closed Lost', 'Declined', 'Declined / withdrawn'] },
    });

    const allPartnerDeals = await this.dealModel.find({ code: partner.code }).lean();

    // Section 4.1: Sales Reporting & Commissions
    const settledDeals = allPartnerDeals.filter((deal) => deal.status === 'Settled');
    const totalReferralValue = settledDeals.reduce((sum, deal) => sum + (deal.financedAmount ?? (deal.amountValue || this.toNumber(deal.amount))), 0);
    const convertedAccounts = settledDeals.length;

    const totalCommissionsEarned = allPartnerDeals
      .filter((deal) => deal.commissionStatus === 'Confirmed' || deal.commissionStatus === 'Paid')
      .reduce((sum, deal) => sum + this.toNumber(deal.commission), 0);

    const estimatedCommission = allPartnerDeals
      .filter((deal) => deal.commissionStatus === 'Estimated')
      .reduce((sum, deal) => sum + this.toNumber(deal.commission), 0);

    return {
      partner,
      stats: {
        referredThisMonth,
        inFlight,
        settled,
        closedLost,
        totalReferralValue: `$${totalReferralValue.toLocaleString()}`,
        convertedAccounts,
        ...(user.role === 'master' ? { totalCommissionsEarned: `$${totalCommissionsEarned.toLocaleString()}`, estimatedCommission: `$${estimatedCommission.toLocaleString()}` } : {}),
      },
      deals: deals.map((deal) => this.mapDeal(deal, user)),
      referralCode: partner.code,
      referralLink: partner.referralLink,
    };
  }

  async getDeals(user: any, search?: string, stage?: string, partnerCode?: string) {
    const query: Record<string, any> = {};
    if (user.role === 'partner') {
      query.code = user.partnerCode;
    } else if (partnerCode) {
      query.code = partnerCode;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
        { applicant: { $regex: search, $options: 'i' } },
      ];
    }

    if (stage && stage !== 'All stages') {
      if (stage === 'Lost' || stage === 'Closed Lost') {
        query.status = { $in: ['Closed Lost', 'Declined', 'Declined / withdrawn'] };
      } else if (stage === 'In flight') {
        query.status = {
          $in: [
            'Lead received',
            'Customer invited',
            'Application submitted',
            'Waiting on customer',
            'In assessment',
            'Approved',
            'Docs / settlement',
            'Application received',
          ],
        };
      } else {
        query.status = stage;
      }
    }

    const deals = await this.dealModel.find(query).sort({ createdAt: -1 }).lean();
    return deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      applicant: deal.applicant,
      submitted: deal.submittedDate,
      stage: deal.status,
      amountBand: deal.amountValue ? `$${Math.round(deal.amountValue / 1000)}k` : deal.amount,
      ...(user.role === 'master' ? { commission: deal.commission, commissionStatus: deal.commissionStatus === 'Confirmed' ? 'confirmed' : deal.commissionStatus === 'Paid' ? 'paid' : 'est.' } : {}),
      rule: deal.type,
      facility: deal.amount,
      partner: deal.code,
      lostReason: deal.lostReason ?? undefined,
      diaryNotes: (deal.diaryNotes || []).filter((note) => user.role === 'master' || !note.isInternal),
    }));
  }

  async getDealById(user: any, id: string) {
    const query: Record<string, string> = { id };
    if (user.role === 'partner') query.code = user.partnerCode;
    const deal = await this.dealModel.findOne(query).lean();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    return this.mapDeal(deal, user);
  }

  async updateDealStatus(user: any, id: string, status: DealStatus, lostReason?: string) {
    const query: Record<string, string> = { id };
    if (user.role === 'partner') query.code = user.partnerCode;

    const previous = await this.dealModel.findOne(query).lean();
    if (!previous) throw new NotFoundException('Deal not found');
    if (previous.status === status) {
      if (status === 'Settled') await this.ensureCommission(previous);
      return this.mapDeal(previous, user);
    }

    const updatePayload: Record<string, any> = {
      status,
      lastActivity: 'Updated just now',
      statusUpdatedAt: new Date().toISOString(),
    };
    if (lostReason !== undefined) {
      updatePayload.lostReason = lostReason;
    }

    const updated = await this.dealModel.findOneAndUpdate(
      query,
      updatePayload,
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new NotFoundException('Deal not found');
    }

    if (status === 'Settled') await this.ensureCommission(updated);

    // Agent Portal - Notifications for Application Status Updates (Change #3)
    if (updated.code) {
      const partner = await this.partnerModel.findOne({ code: updated.code }).exec();
      if (partner && partner.contactEmail && (partner.statusUpdateAlerts !== false) && (partner.notificationsEnabled !== false)) {
        const subject = `[Kredo Update] ${updated.name} status changed to ${status}`;
        const html = `
          <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0a1926; margin-top: 0;">Application Status Update</h2>
            <p>Dear ${partner.name},</p>
            <p>The status of your referred client <strong>${updated.name}</strong> (${updated.applicant}) has been updated:</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; font-size: 15px;">New Stage: <strong style="color: #0a1926;">${status}</strong></p>
              ${lostReason ? `<p style="margin: 8px 0 0; color: #dc2626; font-size: 13px;">Reason: ${lostReason}</p>` : ''}
              <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;">Facility: ${updated.amount} (${updated.type})</p>
            </div>
            <p>Please log in to your Kredo Partner Portal to review progress and notes.</p>
            <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">Kredo Referral Operations</p>
          </div>
        `;
        const plainText = `Application Status Update: ${updated.name} is now ${status}. Facility: ${updated.amount}. Please log in to your Kredo Partner Portal.`;
        void this.mailService.sendMailTo(partner.contactEmail, subject, html, plainText).catch((err) => {
          console.error('Failed to send status update email to partner:', err);
        });
      }
    }

    return this.mapDeal(updated, user);
  }

  async updateDeal(user: any, id: string, dto: { name?: string; applicant?: string; amount?: string; type?: string; lender?: string; financedAmount?: number }) {
    const query: Record<string, string> = { id };
    if (user.role === 'partner') query.code = user.partnerCode;

    const deal = await this.dealModel.findOne(query).exec();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (user.role !== 'master' && (dto.lender !== undefined || dto.financedAmount !== undefined)) {
      throw new ForbiddenException('Finance fields are restricted to administrators');
    }
    const changes: string[] = [];
    if (dto.financedAmount !== undefined && dto.financedAmount !== deal.financedAmount) {
      changes.push(`Amount financed: ${dto.financedAmount}`);
      deal.financedAmount = dto.financedAmount;
    }
    if (dto.lender !== undefined && dto.lender !== deal.lender) {
      changes.push(`Lender: "${deal.lender || 'None'}" -> "${dto.lender}"`);
      deal.lender = dto.lender;
    }
    if (dto.name && dto.name !== deal.name) {
      changes.push(`Business: "${deal.name}" -> "${dto.name}"`);
      deal.name = dto.name;
    }
    if (dto.applicant && dto.applicant !== deal.applicant) {
      changes.push(`Contact: "${deal.applicant}" -> "${dto.applicant}"`);
      deal.applicant = dto.applicant;
    }
    if (dto.amount !== undefined && dto.amount !== deal.amount) {
      changes.push(`Amount: "${deal.amount}" -> "${dto.amount}"`);
      const parsedAmount = this.parseAmount(dto.amount);
      deal.amount = this.formatAmount(parsedAmount);
      deal.amountValue = parsedAmount;
      const commissionValue = Math.round(parsedAmount) / 100;
      deal.commission = this.formatAmount(commissionValue);
    }
    if (dto.type && dto.type !== deal.type) {
      changes.push(`Facility Type: "${deal.type}" -> "${dto.type}"`);
      deal.type = dto.type;
    }

    if (changes.length > 0) {
      deal.lastActivity = 'Deal details edited';
      deal.diaryNotes.unshift({
        id: `NOTE-${randomUUID()}`,
        author: user.name || (user.role === 'master' ? 'Kredo Staff' : 'Partner'),
        content: `Lead updated: ${changes.join(', ')}`,
        isInternal: true,
        createdAt: new Date().toLocaleString('en-AU', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      });
      await deal.save();
      await this.ensureCommission(deal);
    }

    return this.mapDeal(deal, user);
  }

  async addDiaryNote(user: any, dealId: string, dto: { content: string; nextSteps?: string; isInternal?: boolean; author?: string }) {
    const query: Record<string, string> = { id: dealId };
    if (user.role === 'partner') query.code = user.partnerCode;

    const deal = await this.dealModel.findOne(query).exec();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const newNote = {
      id: `NOTE-${randomUUID()}`,
      author: dto.author || user.name || (user.role === 'master' ? 'Craig' : 'Partner'),
      content: dto.content,
      nextSteps: dto.nextSteps,
      isInternal: dto.isInternal !== undefined ? dto.isInternal : true,
      createdAt: new Date().toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    };

    deal.diaryNotes.unshift(newNote);
    deal.lastActivity = 'Note added just now';
    await deal.save();

    return this.mapDeal(deal, user);
  }

  
  async addFollowUpReminder(user: any, dealId: string, dto: { author: string; comment: string; dueDate: string; dueTime: string; dueAt?: string }) {
    const query: Record<string, string> = { id: dealId };
    if (user.role === 'partner') query.code = user.partnerCode;

    const deal = await this.dealModel.findOne(query).exec();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const newReminder = {
      id: `REM-${randomUUID()}`,
      author: dto.author || user.name || 'Craig',
      comment: dto.comment,
      dueDate: dto.dueDate,
      dueTime: dto.dueTime,
      dueAt: dto.dueAt,
      completed: false,
      createdAt: new Date().toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    };

    if (!deal.followUpReminders) {
      deal.followUpReminders = [];
    }
    deal.followUpReminders.unshift(newReminder);
    deal.lastActivity = 'Follow-up scheduled';
    await deal.save();

    return this.mapDeal(deal, user);
  }

  async updateFollowUpReminder(user: any, dealId: string, reminderId: string, completed: boolean) {
    const query: Record<string, string> = { id: dealId };
    if (user.role === 'partner') query.code = user.partnerCode;

    const deal = await this.dealModel.findOne(query).exec();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const reminder = deal.followUpReminders?.find((r) => r.id === reminderId);
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    reminder.completed = completed;
    deal.markModified('followUpReminders');
    await deal.save();

    return this.mapDeal(deal, user);
  }

  async updateCommission(id: string, dto: { status?: 'Confirmed' | 'Paid' | 'Processing'; commissionAmount?: string; paidDate?: string; rate?: string }) {
    const deal = await this.dealModel.findOne({ id }).lean();
    if (deal?.status === 'Settled') await this.ensureCommission(deal);
    const updates: Record<string, string | null> = {};
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.commissionAmount !== undefined) {
      updates.commissionAmount = this.formatAmount(this.parseAmount(dto.commissionAmount));
    }
    if (dto.rate !== undefined) updates.rate = dto.rate;
    if (dto.paidDate !== undefined) updates.paidDate = dto.paidDate;
    if (dto.status === 'Paid' && !dto.paidDate) {
      const existing = await this.commissionModel.findOne({ dealId: id }).lean();
      updates.paidDate = existing?.paidDate || new Date().toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    }
    const commission = await this.commissionModel.findOneAndUpdate(
      { dealId: id }, { $set: updates }, { returnDocument: 'after', runValidators: true },
    );
    if (!commission) {
      throw new NotFoundException('Commission record not found');
    }
    await this.syncCommissionToDeal(commission);
    return commission;
  }

  async createDirectReferral(user: any, dto: any) {
    const dealId = `KRD-${Math.floor(1000 + Math.random() * 9000)}`;
    const parsedAmount = this.parseAmount(dto.amount?.trim() || '0');
    const commissionValue = Math.round(parsedAmount) / 100;
    const created = await this.dealModel.create({
      id: dealId,
      name: dto.businessName,
      applicant: dto.contactName,
      amount: this.formatAmount(parsedAmount),
      amountValue: parsedAmount,
      type: dto.facilityType || 'Asset & Equipment',
      status: 'Lead received',
      lastActivity: 'Just now',
      commission: this.formatAmount(commissionValue),
      commissionStatus: 'Estimated',
      code: user.role === 'partner' ? user.partnerCode : dto.referralCode || 'HAYES01',
      submittedDate: 'Today',
      source: 'direct',
      diaryNotes: [
        {
          id: `NOTE-${randomUUID()}`,
          author: user.name || 'Partner',
          content: 'Direct introduction submitted via Partner Portal.',
          isInternal: true,
          createdAt: 'Today',
        },
      ],
    });

    // Send email alert to kredo@vhmpartners.com.au
    void this.mailService.sendFormNotification(
      `[New Referral] ${dto.businessName} - ${dealId}`,
      `<h2>New Direct Referral Lodged</h2>
      <p><strong>Deal ID:</strong> ${dealId}</p>
      <p><strong>Business Name:</strong> ${dto.businessName}</p>
      <p><strong>Contact Person:</strong> ${dto.contactName}</p>
      <p><strong>Email:</strong> ${dto.email || 'N/A'}</p>
      <p><strong>Phone:</strong> ${dto.phone || 'N/A'}</p>
      <p><strong>Requested Amount:</strong> $${parsedAmount.toLocaleString()}</p>
      <p><strong>Facility Type:</strong> ${dto.facilityType || 'Asset & Equipment'}</p>
      <p><strong>Partner Code:</strong> ${user.role === 'partner' ? user.partnerCode : dto.referralCode || 'HAYES01'}</p>
      <p><strong>Referred By:</strong> ${user.name || 'Partner'}</p>`,
      `New Direct Referral Lodged\nDeal ID: ${dealId}\nBusiness: ${dto.businessName}\nContact: ${dto.contactName}\nPhone: ${dto.phone}\nEmail: ${dto.email}\nAmount: $${parsedAmount.toLocaleString()}\nFacility: ${dto.facilityType}`,
    );

    return this.mapDeal(created, user);
  }

  async createApplication(dto: any) {
    // Also create deal record so partner & master see it in real-time
    const dealId = `KRD-${Math.floor(2000 + Math.random() * 7000)}`;
    // Amount bands use their lower bound until an exact financed value is entered.
    const lowerBound = String(dto.amount).split(/\s*[-\u2013\u2014]\s*/)[0].replace(/\+$/, '');
    const parsedAmount = this.parseAmount(lowerBound);
    const commissionValue = Math.round(parsedAmount) / 100;

    const application = await this.applicationModel.create({
      tradingName: dto.tradingName,
      abn: dto.abn,
      amount: dto.amount,
      purpose: dto.purpose,
      directorName: dto.directorName,
      email: dto.email,
      phone: dto.phone,
      directors: dto.directors || [],
      referralCode: dto.referralCode || null,
      status: 'new',
    });

    // Create live deal record
    await this.dealModel.create({
      id: dealId,
      name: dto.tradingName,
      applicant: dto.directorName,
      amount: dto.amount,
      amountValue: parsedAmount,
      type: dto.purpose || 'Commercial Finance',
      status: 'Application submitted',
      lastActivity: 'Submitted online just now',
      commission: this.formatAmount(commissionValue),
      commissionStatus: 'Estimated',
      code: (dto.referralCode || 'SPUD').toUpperCase(),
      submittedDate: 'Today',
      source: dto.referralCode ? 'hero' : 'partner',
      diaryNotes: [
        {
          id: `NOTE-${randomUUID()}`,
          author: 'Online Portal Application',
          content: `Application received for ${dto.tradingName} (ABN: ${dto.abn || 'N/A'}). Direct contact: ${dto.directorName} (${dto.phone}).`,
          nextSteps: 'Assign credit analyst and initiate loan assessment.',
          isInternal: true,
          createdAt: 'Today',
        },
      ],
    });

    // Send email alert to kredo@vhmpartners.com.au
    const directorsListHtml = (dto.directors && Array.isArray(dto.directors) && dto.directors.length > 0)
      ? dto.directors.map((d: any, idx: number) => `<li><strong>Director ${idx + 1}:</strong> ${d.salutation || ''} ${d.firstName} ${d.middleName || ''} ${d.lastName} - ${d.email} | ${d.phone}</li>`).join('')
      : `<li>${dto.directorName} - ${dto.email} | ${dto.phone}</li>`;

    void this.mailService.sendFormNotification(
      `[New Loan Application] ${dto.tradingName} - ${dealId}`,
      `<h2>New Loan Application Submitted</h2>
      <p><strong>Deal Reference:</strong> ${dealId}</p>
      <p><strong>Trading Name:</strong> ${dto.tradingName}</p>
      <p><strong>ABN:</strong> ${dto.abn || 'N/A'}</p>
      <p><strong>Requested Amount:</strong> ${dto.amount}</p>
      <p><strong>Purpose:</strong> ${dto.purpose || 'Commercial Finance'}</p>
      <p><strong>Referral Code:</strong> ${dto.referralCode || 'Direct (No code)'}</p>
      <h3>Directors:</h3>
      <ul>${directorsListHtml}</ul>`,
      `New Loan Application Submitted\nRef: ${dealId}\nBusiness: ${dto.tradingName}\nABN: ${dto.abn}\nAmount: ${dto.amount}\nContact: ${dto.directorName} (${dto.phone})`,
    );

    return application;
  }

  async createContactRequest(dto: any) {
    const contactReq = await this.contactRequestModel.create({
      businessName: dto.businessName,
      contactName: dto.contactName,
      phone: dto.phone,
      email: dto.email,
      source: dto.source || 'Website - Talk to someone',
      referralCode: dto.referralCode || null,
      notes: dto.notes || null,
      status: 'new',
    });

    // Send email alert to kredo@vhmpartners.com.au
    void this.mailService.sendFormNotification(
      `[Talk to Someone Request] ${dto.businessName || dto.contactName}`,
      `<h2>New Contact / Callback Request</h2>
      <p><strong>Business Name:</strong> ${dto.businessName || 'N/A'}</p>
      <p><strong>Contact Name:</strong> ${dto.contactName}</p>
      <p><strong>Phone:</strong> ${dto.phone}</p>
      <p><strong>Email:</strong> ${dto.email || 'N/A'}</p>
      <p><strong>Source Step:</strong> ${dto.source || 'Website'}</p>
      <p><strong>Referral Code:</strong> ${dto.referralCode || 'None'}</p>
      ${dto.notes ? `<p><strong>Notes:</strong> ${dto.notes}</p>` : ''}`,
      `New Contact Request\nName: ${dto.contactName}\nBusiness: ${dto.businessName}\nPhone: ${dto.phone}\nEmail: ${dto.email}`,
    );

    return contactReq;
  }

  async getCommissions(user: any) {
    if (user.role !== 'master') throw new ForbiddenException('Commission reporting is restricted to administrators');
    const existing = await this.commissionModel.find().select('dealId').lean();
    const missing = await this.dealModel.find({
      status: 'Settled', id: { $nin: existing.map((row) => row.dealId) },
    }).lean();
    for (const deal of missing) await this.ensureCommission(deal);
    const rows = await this.commissionModel.find().sort({ createdAt: -1 }).lean();
    return rows.map((row) => ({
      id: row.dealId,
      dealName: row.dealName,
      client: row.client,
      settledAmount: row.settledAmount,
      rate: row.rate,
      commissionAmount: row.commissionAmount,
      status: row.status,
      paidDate: row.paidDate ?? undefined,
      dealId: row.dealId,
      partnerCode: row.partnerCode ?? undefined,
    }));
  }

  async getMasterPipelineStages() {
    // Section 4.4: Raw numbers by sales stage
    const [leadReceived, customerInvited, applicationSubmitted, waitingOnCustomer] = await Promise.all([
      this.dealModel.countDocuments({ status: 'Lead received' }),
      this.dealModel.countDocuments({ status: 'Customer invited' }),
      this.dealModel.countDocuments({ status: { $in: ['Application submitted', 'Application received'] } }),
      this.dealModel.countDocuments({ status: 'Waiting on customer' }),
    ]);

    return {
      leadReceived,
      customerInvited,
      applicationSubmitted,
      waitingOnCustomer,
    };
  }

  async getMasterOverview() {
    const partners = await this.partnerModel.find().lean();
    const deals = await this.dealModel.find().lean();
    const totalDeals = deals.length;
    const inFlight = deals.filter((deal) =>
      [
        'Lead received',
        'Customer invited',
        'Application submitted',
        'Waiting on customer',
        'In assessment',
        'Approved',
        'Docs / settlement',
        'Application received',
      ].includes(deal.status),
    ).length;
    const settledMonth = deals.filter((deal) => deal.status === 'Settled').length;
    const closedLostCount = deals.filter((deal) =>
      ['Closed Lost', 'Declined', 'Declined / withdrawn'].includes(deal.status),
    ).length;

    const settledDealsList = deals.filter((deal) => deal.status === 'Settled');
    const totalAmountFinanced = settledDealsList.reduce((sum, deal) => sum + (deal.financedAmount ?? (deal.amountValue || this.toNumber(deal.amount))), 0);
    const totalAccountsFinanced = settledDealsList.length;

    const commissionTotal = deals.reduce((sum, deal) => sum + this.toNumber(deal.commission), 0);

    const partnerPerformance = partners
      .map((partner) => {
        const partnerDeals = deals.filter((deal) => deal.code === partner.code);
        const settledDeals = partnerDeals.filter((deal) => deal.status === 'Settled');
        return {
          name: partner.name,
          code: partner.code,
          deals: partnerDeals.length,
          settledVolume: settledDeals.reduce((total, deal) => total + (deal.financedAmount ?? (deal.amountValue || this.toNumber(deal.amount))), 0),
        };
      })
      .sort((left, right) => right.settledVolume - left.settledVolume);

    const topPartners = partnerPerformance.slice(0, 3).map((partner, index) => ({
      rank: index + 1,
      name: partner.name,
      code: partner.code,
      deals: partner.deals,
      volume: `$${partner.settledVolume.toLocaleString()}`,
    }));

    return {
      stats: {
        activePartners: partners.length,
        inFlightDeals: inFlight,
        settledThisMonth: settledMonth,
        closedLostDeals: closedLostCount,
        commissionAccrued: `${commissionTotal.toLocaleString()}`,
        totalAmountFinanced: `$${totalAmountFinanced.toLocaleString()}`,
        totalAccountsFinanced,
      },
      funnel: {
        referred: totalDeals,
        received: deals.filter((deal) =>
          [
            'Lead received',
            'Customer invited',
            'Application submitted',
            'Waiting on customer',
            'Application received',
            'In assessment',
            'Approved',
            'Docs / settlement',
            'Settled',
          ].includes(deal.status),
        ).length,
        approved: deals.filter((deal) => ['Approved', 'Docs / settlement', 'Settled'].includes(deal.status)).length,
        settled: deals.filter((deal) => deal.status === 'Settled').length,
        lost: closedLostCount,
      },
      topPartners,
      network: await this.getIdSummary(),
    };
  }

  async getMasterPipeline() {
    const [deals, partners] = await Promise.all([
      this.dealModel.find().sort({ createdAt: -1 }).lean(),
      this.partnerModel.find().lean(),
    ]);
    const namesByCode = new Map(partners.map((partner) => [partner.code, partner.name]));
    return deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      applicant: deal.applicant,
      partner: namesByCode.get(deal.code) || deal.code,
      partnerCode: deal.code,
      submitted: deal.submittedDate,
      stage: deal.status,
      amountBand: deal.amount,
      commission: deal.commission,
      lostReason: deal.lostReason ?? undefined,
      diaryNotes: deal.diaryNotes || [],
      followUpReminders: deal.followUpReminders || [],
    }));
  }

  async getPartnerDirectory() {
    const [partners, deals] = await Promise.all([
      this.partnerModel.find().lean(),
      this.dealModel.find().lean(),
    ]);
    return partners.map((partner) => ({
      id: partner.code,
      name: partner.name,
      badge: partner.isHero ? 'Hero' : 'Standard',
      contact: partner.name,
      email: partner.contactEmail,
      code: partner.code,
      deals: deals.filter((deal) => deal.code === partner.code).length,
      settled: `$${deals
        .filter((deal) => deal.code === partner.code && deal.status === 'Settled')
        .reduce((total, deal) => total + (deal.financedAmount ?? (deal.amountValue || this.toNumber(deal.amount))), 0)
        .toLocaleString()}`,
      status: partner.status === 'active' ? 'Active' : 'Paused',
      phone: partner.phone || '1300 4 KREDO',
      abn: partner.abn || '48 000 000 000',
      commissionRate: partner.commissionRate || '1.00%',
      bankAccount: partner.bankAccount || '',
      bsb: partner.bsb || '',
      accountName: partner.accountName || '',
      avatar: partner.name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase(),
    }));
  }

  async getMasterReports() {
    const [deals, partners] = await Promise.all([
      this.dealModel.find().lean(),
      this.partnerModel.find().lean(),
    ]);
    const sources = [
      { label: 'Tracked link', source: 'partner', color: '#1e4868' },
      { label: 'Typed code', source: 'typed-code', color: '#c79744' },
      { label: 'Hero page', source: 'hero', color: '#7dc5eb' },
      { label: 'Direct referral', source: 'direct', color: '#5b8c5a' },
    ];
    const totalDeals = deals.length;
    const sourceMix = sources.map(({ label, source, color }) => ({
      label,
      value: totalDeals
        ? Math.round((deals.filter((deal) => deal.source === source).length / totalDeals) * 100)
        : 0,
      color,
    }));
    const partnerPerformance = partners
      .map((partner) => ({
        name: partner.name,
        settledVolume: deals
          .filter((deal) => deal.code === partner.code && deal.status === 'Settled')
          .reduce((total, deal) => total + (deal.financedAmount ?? (deal.amountValue || this.toNumber(deal.amount))), 0),
      }))
      .sort((left, right) => right.settledVolume - left.settledVolume);
    const maxVolume = partnerPerformance[0]?.settledVolume || 0;
    return {
      sourceMix,
      partnerPerformance: partnerPerformance.slice(0, 5).map((partner) => ({
        name: partner.name,
        volume: `$${partner.settledVolume.toLocaleString()}`,
        percent: maxVolume ? Math.round((partner.settledVolume / maxVolume) * 100) : 0,
      })),
    };
  }

  async getMasterPreferences(user: any) {
    const master = await this.userModel.findById(user.sub).lean();
    if (!master) {
      throw new NotFoundException('Master user not found');
    }
    return { weeklyReportsEnabled: master.weeklyReportsEnabled ?? false };
  }

  async updateMasterPreferences(user: any, weeklyReportsEnabled: boolean) {
    const master = await this.userModel.findByIdAndUpdate(
      user.sub,
      { weeklyReportsEnabled },
      { returnDocument: 'after' },
    ).lean();
    if (!master) {
      throw new NotFoundException('Master user not found');
    }
    return { weeklyReportsEnabled: master.weeklyReportsEnabled };
  }

  async getPartnerSettings(user: any) {
    return this.getPartnerProfile(user);
  }

  async updatePartnerSettings(user: any, dto: any) {
    const partnerCode = user.partnerCode || 'HAYES01';
    const updated = await this.partnerModel.findOneAndUpdate(
      { code: partnerCode },
      {
        name: dto.name,
        contactEmail: dto.contactEmail,
        phone: dto.phone,
        bankAccount: dto.bankAccount,
        bsb: dto.bsb,
        abn: dto.abn,
        notificationsEnabled: dto.notificationsEnabled,
        settlementAlerts: dto.settlementAlerts,
        statusUpdateAlerts: dto.statusUpdateAlerts,
        marketingEmails: dto.marketingEmails,
      },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new NotFoundException('Partner settings not found');
    }

    return this.getPartnerProfile(user);
  }

  async addPartner(dto: any) {
    const code = (dto.uniqueCode || '').toUpperCase() || 'PARTNE2';
    const existing = await this.partnerModel.findOne({ code }).exec();
    if (existing) {
      throw new Error('Partner code already exists');
    }

    const partnerPhone = dto.phone || '1300 4 KREDO';
    const partnerAbn = dto.abn || '48 000 000 000';
    const commissionRate = dto.commissionRate || '1.00%';
    const partnerEmail = (dto.email || '').toLowerCase().trim();

    const partner = await this.partnerModel.create({
      name: dto.tradingName,
      code,
      partnerType: dto.partnerType || 'Standard',
      contactEmail: partnerEmail,
      phone: partnerPhone,
      bankAccount: dto.bankAccount || '',
      bsb: dto.bsb || '',
      accountName: dto.accountName || '',
      abn: partnerAbn,
      commissionRate,
      referralLink: `kredo.au/apply?ref=${code}`,
      notificationsEnabled: true,
      settlementAlerts: true,
      marketingEmails: false,
      status: 'active',
      isHero: dto.partnerType === 'Hero',
    });

    const user = await this.userModel.findOne({ email: partnerEmail }).exec();
    if (!user) {
      await this.userModel.create({
        email: partnerEmail,
        passwordHash: '$2a$10$9P4fJ5Uz7eO1mknMzjDkzerVp.5vUeW4XxXFAZV3mVJrbo54yJjX2',
        role: 'partner',
        name: dto.tradingName,
        partnerCode: code,
        isActive: true,
      });
    }

    // 1. Send Welcome Email directly to the new Partner (Issue #1 fix)
    if (partnerEmail) {
      const applyUrl = `https://kredo-portal-frontend.vercel.app/apply?ref=${code}`;
      void this.mailService.sendMailTo(
        partnerEmail,
        `Welcome to Kredo Partner Network - Your Partner Code: ${code}`,
        `<h2>Welcome to the Kredo Partner Network!</h2>
        <p>Dear ${dto.primaryContact || dto.tradingName},</p>
        <p>Your referral partner profile for <strong>${dto.tradingName}</strong> has been successfully activated on the Kredo Referral Platform.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p><strong>Your Unique Partner Code:</strong> <span style="font-size:18px;font-weight:bold;color:#0a1926;background:#e0f2fe;padding:2px 8px;border-radius:4px;">${code}</span></p>
        <p><strong>Your Client Application Link:</strong> <a href="${applyUrl}">${applyUrl}</a></p>
        <p><strong>Commission Structure:</strong> ${commissionRate} trail settlement commission</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p>Clients who apply through your link or quote your code will automatically be tracked to your account for assessment and commission payout.</p>
        <p>Best regards,<br/><strong>The Kredo Partnerships Team</strong><br/>Phone: 1300 4 KREDO (1300 457 336)<br/>Email: kredo@vhmpartners.com.au</p>`,
        `Welcome to Kredo Partner Network!\n\nYour Partner Code: ${code}\nClient Application Link: ${applyUrl}\nCommission Structure: ${commissionRate}\n\nPhone: 1300 4 KREDO | Email: kredo@vhmpartners.com.au`,
      );
    }

    // 2. Send Notification to Kredo Admin Team
    void this.mailService.sendFormNotification(
      `[New Partner Onboarded] ${dto.tradingName} (${code})`,
      `<h2>New Referral Partner Registered</h2>
      <p><strong>Trading Name:</strong> ${dto.tradingName}</p>
      <p><strong>Primary Contact:</strong> ${dto.primaryContact || 'N/A'}</p>
      <p><strong>Email:</strong> ${partnerEmail}</p>
      <p><strong>Phone:</strong> ${partnerPhone}</p>
      <p><strong>ABN:</strong> ${partnerAbn}</p>
      <p><strong>Partner Code:</strong> ${code}</p>
      <p><strong>Partner Tier:</strong> ${dto.partnerType || 'Standard'}</p>
      <p><strong>Commission Structure:</strong> ${commissionRate}</p>`,
      `New Partner Registered\nTrading Name: ${dto.tradingName}\nContact: ${dto.primaryContact}\nEmail: ${partnerEmail}\nPhone: ${partnerPhone}\nABN: ${partnerAbn}\nCode: ${code}\nCommission: ${commissionRate}`,
    );

    return {
      ...partner.toObject(),
      message: 'Partner created and welcome email dispatched',
    };
  }

  async updateMasterPartner(code: string, dto: { name?: string; contactEmail?: string; partnerType?: string; status?: string; phone?: string; abn?: string; commissionRate?: string; bankAccount?: string; bsb?: string; accountName?: string }) {
    const partner = await this.partnerModel.findOne({ code: code.toUpperCase() }).exec();
    if (!partner) {
      throw new NotFoundException(`Partner with code ${code} not found`);
    }

    if (dto.name !== undefined) partner.name = dto.name;
    if (dto.contactEmail !== undefined) partner.contactEmail = dto.contactEmail;
    if (dto.partnerType !== undefined) {
      partner.partnerType = dto.partnerType;
      partner.isHero = dto.partnerType === 'Hero';
    }
    if (dto.status !== undefined) {
      partner.status = dto.status.toLowerCase() === 'active' ? 'active' : 'paused';
    }
    if (dto.phone !== undefined) partner.phone = dto.phone;
    if (dto.abn !== undefined) partner.abn = dto.abn;
    if (dto.commissionRate !== undefined) partner.commissionRate = dto.commissionRate;
    if (dto.bankAccount !== undefined) partner.bankAccount = dto.bankAccount;
    if (dto.bsb !== undefined) partner.bsb = dto.bsb;
    if (dto.accountName !== undefined) partner.accountName = dto.accountName;

    await partner.save();

    // Also update associated user if exists
    if (dto.name || dto.contactEmail) {
      await this.userModel.findOneAndUpdate(
        { partnerCode: partner.code },
        {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.contactEmail ? { email: dto.contactEmail.toLowerCase() } : {}),
        },
      );
    }

    return partner;
  }

  async deleteMasterPartner(code: string) {
    const normalizedCode = code.toUpperCase();
    const partner = await this.partnerModel.findOne({ code: normalizedCode }).exec();
    if (!partner) {
      throw new NotFoundException(`Partner with code ${code} not found`);
    }

    await this.partnerModel.deleteOne({ code: normalizedCode });
    // Also remove or deactivate partner user
    await this.userModel.deleteMany({ partnerCode: normalizedCode });

    return { success: true, message: `Partner ${partner.name} (${normalizedCode}) deleted` };
  }

  private async getIdSummary() {
    const [deals, partners] = await Promise.all([
      this.dealModel.find().lean(),
      this.partnerModel.find().lean(),
    ]);
    const namesByCode = new Map(partners.map((partner) => [partner.code, partner.name]));
    return deals.map((deal) => ({
      ref: deal.id,
      name: deal.name,
      partner: namesByCode.get(deal.code) || deal.code,
      submitted: deal.submittedDate,
      stage: deal.status,
      amountBand: deal.amount,
      commission: deal.commission,
      lostReason: deal.lostReason ?? undefined,
    }));
  }
}
