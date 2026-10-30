import { Injectable, NotFoundException } from '@nestjs/common';
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

  private mapDeal(doc: any) {
    return {
      id: doc.id,
      name: doc.name,
      applicant: doc.applicant,
      amount: doc.amount,
      type: doc.type,
      status: doc.status,
      lastActivity: doc.lastActivity,
      commission: doc.commission,
      commissionStatus: doc.commissionStatus,
      code: doc.code,
      submittedDate: doc.submittedDate,
      lostReason: doc.lostReason ?? undefined,
      diaryNotes: doc.diaryNotes || [],
    };
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

    // Section 4.1: Total commissions earned
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
        totalCommissionsEarned: `$${totalCommissionsEarned.toLocaleString()}`,
        estimatedCommission: `$${estimatedCommission.toLocaleString()}`,
      },
      deals: deals.slice(0, 6).map((deal) => this.mapDeal(deal)),
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
      commission: deal.commission,
      commissionStatus:
        deal.commissionStatus === 'Confirmed' ? 'confirmed' : deal.commissionStatus === 'Paid' ? 'paid' : 'est.',
      rule: deal.type,
      facility: deal.amount,
      partner: deal.code,
      lostReason: deal.lostReason ?? undefined,
      diaryNotes: deal.diaryNotes || [],
    }));
  }

  async getDealById(user: any, id: string) {
    const query: Record<string, string> = { id };
    if (user.role === 'partner') query.code = user.partnerCode;
    const deal = await this.dealModel.findOne(query).lean();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    return this.mapDeal(deal);
  }

  async updateDealStatus(user: any, id: string, status: DealStatus, lostReason?: string) {
    const query: Record<string, string> = { id };
    if (user.role === 'partner') query.code = user.partnerCode;

    const updatePayload: Record<string, any> = {
      status,
      lastActivity: 'Updated just now',
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

    return this.mapDeal(updated);
  }

  async addDiaryNote(user: any, dealId: string, dto: { content: string; nextSteps?: string; isInternal?: boolean }) {
    const query: Record<string, string> = { id: dealId };
    if (user.role === 'partner') query.code = user.partnerCode;

    const deal = await this.dealModel.findOne(query).exec();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const newNote = {
      id: `NOTE-${Date.now().toString().slice(-6)}`,
      author: user.name || (user.role === 'master' ? 'Kredo Staff' : 'Partner'),
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

    return this.mapDeal(deal);
  }

  async updateCommission(id: string, dto: { status?: 'Confirmed' | 'Paid' | 'Processing'; commissionAmount?: string; paidDate?: string; rate?: string }) {
    const commission = await this.commissionModel.findOne({ dealId: id }).exec();
    if (!commission) {
      throw new NotFoundException('Commission record not found');
    }

    if (dto.status) commission.status = dto.status;
    if (dto.commissionAmount) commission.commissionAmount = dto.commissionAmount;
    if (dto.rate) commission.rate = dto.rate;
    if (dto.paidDate !== undefined) commission.paidDate = dto.paidDate;
    if (dto.status === 'Paid' && !commission.paidDate) {
      commission.paidDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    await commission.save();

    // Also update deal commission status if applicable
    const dealStatusMap: Record<string, 'Confirmed' | 'Paid' | 'Estimated'> = {
      Confirmed: 'Confirmed',
      Paid: 'Paid',
      Processing: 'Estimated',
    };
    if (dto.status) {
      await this.dealModel.findOneAndUpdate(
        { id },
        { commissionStatus: dealStatusMap[dto.status] || 'Estimated' },
      );
    }

    return commission;
  }

  async createDirectReferral(user: any, dto: any) {
    const dealId = `KRD-${Math.floor(1000 + Math.random() * 9000)}`;
    const parsedAmount = Number(String(dto.amount || '250000').replace(/[^\d]/g, '')) || 250000;
    const commissionValue = Math.round(parsedAmount * 0.01);
    const created = await this.dealModel.create({
      id: dealId,
      name: dto.businessName,
      applicant: dto.contactName,
      amount: `$${parsedAmount.toLocaleString()}`,
      amountValue: parsedAmount,
      type: dto.facilityType || 'Asset & Equipment',
      status: 'Lead received',
      lastActivity: 'Just now',
      commission: `$${commissionValue.toLocaleString()}`,
      commissionStatus: 'Estimated',
      code: user.role === 'partner' ? user.partnerCode : dto.referralCode || 'HAYES01',
      submittedDate: 'Today',
      source: 'direct',
      diaryNotes: [
        {
          id: `NOTE-${Date.now().toString().slice(-6)}`,
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

    return this.mapDeal(created);
  }

  async createApplication(dto: any) {
    // Also create deal record so partner & master see it in real-time
    const dealId = `KRD-${Math.floor(2000 + Math.random() * 7000)}`;
    const parsedAmount = Number(String(dto.amount || '100000').replace(/[^\d]/g, '')) || 100000;
    const commissionValue = Math.round(parsedAmount * 0.01);

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
      commission: `$${commissionValue.toLocaleString()}`,
      commissionStatus: 'Estimated',
      code: (dto.referralCode || 'SPUD').toUpperCase(),
      submittedDate: 'Today',
      source: dto.referralCode ? 'hero' : 'partner',
      diaryNotes: [
        {
          id: `NOTE-${Date.now().toString().slice(-6)}`,
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
    const query = user.role === 'partner' ? { partnerCode: user.partnerCode } : {};
    const rows = await this.commissionModel.find(query).sort({ createdAt: -1 }).lean();
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

    const commissionTotal = deals.reduce((sum, deal) => sum + this.toNumber(deal.commission), 0);

    const partnerPerformance = partners
      .map((partner) => {
        const partnerDeals = deals.filter((deal) => deal.code === partner.code);
        const settledDeals = partnerDeals.filter((deal) => deal.status === 'Settled');
        return {
          name: partner.name,
          code: partner.code,
          deals: partnerDeals.length,
          settledVolume: settledDeals.reduce((total, deal) => total + (deal.amountValue || 0), 0),
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
        commissionAccrued: `$${commissionTotal.toLocaleString()}`,
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
        .reduce((total, deal) => total + (deal.amountValue || 0), 0)
        .toLocaleString()}`,
      status: partner.status === 'active' ? 'Active' : 'Paused',
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
          .reduce((total, deal) => total + (deal.amountValue || 0), 0),
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

    const partner = await this.partnerModel.create({
      name: dto.tradingName,
      code,
      partnerType: dto.partnerType || 'Standard',
      contactEmail: dto.email,
      phone: '1300 4 KREDO',
      bankAccount: '1098 4421',
      bsb: '062-000',
      abn: '48 000 000 000',
      referralLink: `kredo.au/apply?ref=${code}`,
      notificationsEnabled: true,
      settlementAlerts: true,
      marketingEmails: false,
      status: 'active',
      isHero: dto.partnerType === 'Hero',
    });

    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (!user) {
      const email = dto.email.toLowerCase();
      await this.userModel.create({
        email,
        passwordHash: '$2a$10$9P4fJ5Uz7eO1mknMzjDkzerVp.5vUeW4XxXFAZV3mVJrbo54yJjX2',
        role: 'partner',
        name: dto.tradingName,
        partnerCode: code,
        isActive: true,
      });
    }

    return {
      ...partner.toObject(),
      message: 'Partner created',
    };
  }

  async updateMasterPartner(code: string, dto: { name?: string; contactEmail?: string; partnerType?: string; status?: string; phone?: string }) {
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
