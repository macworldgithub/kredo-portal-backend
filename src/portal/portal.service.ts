import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../auth/user.schema.js';
import { Commission } from '../schemas/commission.schema.js';
import { Deal, DealStatus } from '../schemas/deal.schema.js';
import { Partner } from '../schemas/partner.schema.js';
import { Application } from '../schemas/application.schema.js';

@Injectable()
export class PortalService {
  constructor(
    @InjectModel(Partner.name) private readonly partnerModel: Model<Partner>,
    @InjectModel(Deal.name) private readonly dealModel: Model<Deal>,
    @InjectModel(Commission.name) private readonly commissionModel: Model<Commission>,
    @InjectModel(Application.name) private readonly applicationModel: Model<Application>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
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
      .limit(4)
      .lean();

    const referredThisMonth = await this.dealModel.countDocuments({
      code: partner.code,
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    });

    const inFlight = await this.dealModel.countDocuments({
      code: partner.code,
      status: { $in: ['In assessment', 'Approved', 'Docs / settlement', 'Application received'] },
    });

    const settled = await this.dealModel.countDocuments({
      code: partner.code,
      status: 'Settled',
    });

    const totalCommission = (await this.dealModel.find({ code: partner.code }).lean()).reduce((sum, deal) => {
      return sum + this.toNumber(deal.commission);
    }, 0);

    return {
      partner,
      stats: {
        referredThisMonth,
        inFlight,
        settled,
        estimatedCommission: `$${totalCommission.toLocaleString()}`,
      },
      deals: deals.map((deal) => this.mapDeal(deal)),
      referralCode: partner.code,
      referralLink: partner.referralLink,
    };
  }

  async getDeals(search?: string, stage?: string) {
    const query: Record<string, any> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
      ];
    }
    if (stage && stage !== 'All stages') {
      query.status = stage;
    }

    const deals = await this.dealModel.find(query).sort({ createdAt: -1 }).lean();
    return deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      submitted: deal.submittedDate,
      stage: deal.status,
      amountBand: `$${Math.round(deal.amountValue / 1000)}k`,
      commission: deal.commission,
      commissionStatus: deal.commissionStatus === 'Confirmed' ? 'confirmed' : deal.commissionStatus === 'Paid' ? 'paid' : 'est.',
      rule: deal.type,
      facility: deal.amount,
      partner: 'Hayes Partners',
    }));
  }

  async getDealById(id: string) {
    const deal = await this.dealModel.findOne({ id }).lean();
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    return this.mapDeal(deal);
  }

  async updateDealStatus(id: string, status: DealStatus) {
    const updated = await this.dealModel.findOneAndUpdate(
      { id },
      {
        status,
        lastActivity: 'Updated just now',
      },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new NotFoundException('Deal not found');
    }

    return this.mapDeal(updated);
  }

  async createDirectReferral(dto: any) {
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
      status: 'In assessment',
      lastActivity: 'Just now',
      commission: `$${commissionValue.toLocaleString()}`,
      commissionStatus: 'Estimated',
      code: dto.referralCode || 'HAYES01',
      submittedDate: 'Today',
      source: 'direct',
    });

    return this.mapDeal(created);
  }

  async createApplication(dto: any) {
    return this.applicationModel.create({
      tradingName: dto.tradingName,
      abn: dto.abn,
      amount: dto.amount,
      purpose: dto.purpose,
      directorName: dto.directorName,
      email: dto.email,
      phone: dto.phone,
      referralCode: dto.referralCode || null,
      status: 'new',
    });
  }

  async getCommissions() {
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
    }));
  }

  async getMasterOverview() {
    const partners = await this.partnerModel.find().lean();
    const deals = await this.dealModel.find().lean();
    const totalDeals = deals.length;
    const inFlight = deals.filter((deal) => ['In assessment', 'Approved', 'Docs / settlement', 'Application received'].includes(deal.status)).length;
    const settledMonth = deals.filter((deal) => deal.status === 'Settled').length;

    const commissionTotal = deals.reduce((sum, deal) => sum + this.toNumber(deal.commission), 0);

    const topPartners = partners.slice(0, 3).map((partner, index) => ({
      rank: index + 1,
      name: partner.name,
      code: partner.code,
      deals: Math.max(3, Math.round((index + 1) * 6)),
      volume: `$${(Math.round((index + 1) * 180000) + 100000).toLocaleString()}`,
    }));

    return {
      stats: {
        activePartners: partners.length,
        inFlightDeals: inFlight,
        settledThisMonth: settledMonth,
        commissionAccrued: `$${commissionTotal.toLocaleString()}`,
      },
      funnel: {
        referred: totalDeals,
        received: deals.filter((deal) => ['Application received', 'In assessment', 'Approved', 'Docs / settlement', 'Settled'].includes(deal.status)).length,
        approved: deals.filter((deal) => ['Approved', 'Docs / settlement', 'Settled'].includes(deal.status)).length,
        settled: deals.filter((deal) => deal.status === 'Settled').length,
      },
      topPartners,
      network: await this.getIdSummary(),
    };
  }

  async getMasterPipeline() {
    const deals = await this.dealModel.find().sort({ createdAt: -1 }).lean();
    return deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      partner: 'Hayes Partners',
      partnerCode: deal.code,
      submitted: deal.submittedDate,
      stage: deal.status,
      amountBand: deal.amount,
      commission: deal.commission,
    }));
  }

  async getPartnerDirectory() {
    const partners = await this.partnerModel.find().lean();
    return partners.map((partner) => ({
      id: partner.code,
      name: partner.name,
      badge: partner.isHero ? 'Hero' : 'Standard',
      contact: partner.name,
      email: partner.contactEmail,
      code: partner.code,
      deals: 12,
      settled: '$380k',
      status: partner.status === 'active' ? 'Active' : 'Paused',
      avatar: partner.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
    }));
  }

  async getMasterReports() {
    return {
      sourceMix: [
        { label: 'Tracked link', value: 46, color: '#1e4868' },
        { label: 'Typed code', value: 32, color: '#c79744' },
        { label: 'Hero page', value: 22, color: '#7dc5eb' },
      ],
      partnerPerformance: [
        { name: 'Mark Carroll', volume: '$640k', percent: 100 },
        { name: 'Hayes Partners', volume: '$380k', percent: 60 },
        { name: 'North & Kind Advisory', volume: '$295k', percent: 46 },
      ],
    };
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
      phone: '+61 412 000 000',
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

  private async getIdSummary() {
    const deals = await this.dealModel.find().lean();
    return deals.map((deal) => ({
      ref: deal.id,
      name: deal.name,
      partner: 'Hayes Partners',
      submitted: deal.submittedDate,
      stage: deal.status,
      amountBand: deal.amount,
      commission: deal.commission,
    }));
  }
}
