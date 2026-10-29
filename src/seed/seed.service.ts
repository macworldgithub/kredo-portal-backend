import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth/auth.service.js';
import { User } from '../auth/user.schema.js';
import { Partner } from '../schemas/partner.schema.js';
import { Deal } from '../schemas/deal.schema.js';
import { Commission } from '../schemas/commission.schema.js';

const defaultPartnerSeed: Array<Partial<Partner>> = [
  {
    name: 'Hayes Partners',
    code: 'HAYES01',
    partnerType: 'Commercial & Business Broking',
    contactEmail: 'admin@hayespartners.com.au',
    phone: '1300 4 KREDO',
    bankAccount: '1098 4421',
    bsb: '062-000',
    abn: '48 192 847 219',
    referralLink: 'kredo.au/apply?ref=HAYES01',
    notificationsEnabled: true,
    settlementAlerts: true,
    marketingEmails: false,
    status: 'active',
    isHero: false,
  },
  {
    name: 'Mark Carroll',
    code: 'SPUD',
    partnerType: 'Hero Partner',
    contactEmail: 'kredo@vhmpartners.com.au',
    phone: '1300 4 KREDO',
    bankAccount: '1200 4821',
    bsb: '062-010',
    abn: '56 534 221 198',
    referralLink: 'kredo.au/spud',
    notificationsEnabled: true,
    settlementAlerts: true,
    marketingEmails: false,
    status: 'active',
    isHero: true,
  },
  {
    name: 'North & Kind Advisory',
    code: 'NORTHK',
    partnerType: 'Standard',
    contactEmail: 'alex@northkind.example',
    phone: '1300 4 KREDO',
    bankAccount: '9982 4401',
    bsb: '062-100',
    abn: '46 321 903 401',
    referralLink: 'kredo.au/apply?ref=NORTHK',
    notificationsEnabled: true,
    settlementAlerts: true,
    marketingEmails: false,
    status: 'active',
    isHero: false,
  },
];

const defaultDeals: Array<Partial<Deal>> = [
  {
    id: 'KRD-2841',
    name: 'Oak & Reed Landscaping',
    applicant: 'Marcus Vance',
    amount: '$180,000',
    amountValue: 180000,
    type: 'Asset & Equipment',
    status: 'In assessment',
    lastActivity: '18 minutes ago',
    commission: '$1,800',
    commissionStatus: 'Estimated',
    code: 'HAYES01',
    submittedDate: '16 Sep 2026',
    source: 'partner',
    diaryNotes: [
      {
        id: 'NOTE-1',
        author: 'Sarah Jenkins (Credit)',
        content: 'Initial financials received. Reviewing 2025/2026 tax returns.',
        nextSteps: 'Request bank statement verification via portal.',
        isInternal: true,
        createdAt: '16 Sep 2026, 10:30am',
      },
    ],
  },
  {
    id: 'KRD-2832',
    name: 'Harbour Health Group',
    applicant: 'Dr. Evelyn Wei',
    amount: '$420,000',
    amountValue: 420000,
    type: 'Working Capital',
    status: 'Approved',
    lastActivity: '2 hours ago',
    commission: '$3,100',
    commissionStatus: 'Confirmed',
    code: 'HAYES01',
    submittedDate: '15 Sep 2026',
    source: 'partner',
    diaryNotes: [
      {
        id: 'NOTE-2',
        author: 'Michael Chong (Broker)',
        content: 'Formal approval received from lender panel at 7.25% p.a.',
        nextSteps: 'Send loan contract pack for electronic execution.',
        isInternal: true,
        createdAt: '15 Sep 2026, 2:15pm',
      },
    ],
  },
  {
    id: 'KRD-2819',
    name: 'Pilbara Civil Works',
    applicant: 'Brett Johnstone',
    amount: '$650,000',
    amountValue: 650000,
    type: 'Commercial Term Facility',
    status: 'Docs / settlement',
    lastActivity: 'Yesterday',
    commission: '$4,550',
    commissionStatus: 'Estimated',
    code: 'HAYES01',
    submittedDate: '14 Sep 2026',
    source: 'partner',
  },
  {
    id: 'KRD-2788',
    name: 'Northbank Hospitality',
    applicant: 'Sofia Rossi',
    amount: '$310,000',
    amountValue: 310000,
    type: 'Refinance & Expansion',
    status: 'Settled',
    lastActivity: '12 Sep, 3:12pm',
    commission: '$3,100',
    commissionStatus: 'Confirmed',
    code: 'HAYES01',
    submittedDate: '10 Sep 2026',
    source: 'partner',
  },
  {
    id: 'KRD-2760',
    name: 'Bayside Logistics Fleet',
    applicant: 'Trevor Smith',
    amount: '$540,000',
    amountValue: 540000,
    type: 'Heavy Vehicle Asset',
    status: 'Settled',
    lastActivity: '08 Sep, 11:30am',
    commission: '$3,780',
    commissionStatus: 'Paid',
    code: 'HAYES01',
    submittedDate: '05 Sep 2026',
    source: 'partner',
  },
  {
    id: 'KRD-2710',
    name: 'Apex Precision Engineering',
    applicant: 'David Miller',
    amount: '$220,000',
    amountValue: 220000,
    type: 'Equipment Finance',
    status: 'Closed Lost',
    lastActivity: '01 Sep, 4:00pm',
    commission: '$1,980',
    commissionStatus: 'Estimated',
    code: 'HAYES01',
    submittedDate: '28 Aug 2026',
    source: 'partner',
    lostReason: 'Client opted for captive OEM dealer finance package.',
    diaryNotes: [
      {
        id: 'NOTE-3',
        author: 'Sarah Jenkins (Credit)',
        content: 'OEM offered 0.9% promo financing. Kredo unable to match subvented manufacturer rate.',
        nextSteps: 'Follow up in 6 months for secondary working capital needs.',
        isInternal: true,
        createdAt: '01 Sep 2026, 4:15pm',
      },
    ],
  },
  {
    id: 'KRD-2842',
    name: 'Alloy Fleet Services',
    applicant: 'Alicia Green',
    amount: '$250,000',
    amountValue: 250000,
    type: 'Asset & Equipment',
    status: 'Application submitted',
    lastActivity: 'Today, 9:12am',
    commission: '$2,000',
    commissionStatus: 'Estimated',
    code: 'NORTHK',
    submittedDate: 'Today',
    source: 'typed-code',
  },
  {
    id: 'KRD-2850',
    name: 'Barwon Civil Contractors',
    applicant: 'Nathan Cole',
    amount: '$380,000',
    amountValue: 380000,
    type: 'Yellow Goods',
    status: 'Lead received',
    lastActivity: 'Today, 11:45am',
    commission: '$2,850',
    commissionStatus: 'Estimated',
    code: 'SPUD',
    submittedDate: 'Today',
    source: 'hero',
  },
  {
    id: 'KRD-2851',
    name: 'Coastal Logistics Group',
    applicant: 'Fiona Kelly',
    amount: '$450,000',
    amountValue: 450000,
    type: 'Fleet Lease',
    status: 'Customer invited',
    lastActivity: 'Today, 1:20pm',
    commission: '$3,375',
    commissionStatus: 'Estimated',
    code: 'SPUD',
    submittedDate: 'Today',
    source: 'hero',
  },
  {
    id: 'KRD-2852',
    name: 'Meridian Health Partners',
    applicant: 'Simon Clark',
    amount: '$290,000',
    amountValue: 290000,
    type: 'Working Capital',
    status: 'Waiting on customer',
    lastActivity: 'Today, 2:10pm',
    commission: '$2,175',
    commissionStatus: 'Estimated',
    code: 'HAYES01',
    submittedDate: 'Today',
    source: 'partner',
    diaryNotes: [
      {
        id: 'NOTE-4',
        author: 'Craig (Operations)',
        content: 'Chased accountant for Q4 BAS and trust deeds.',
        nextSteps: 'Reminder scheduled for tomorrow 10am.',
        isInternal: true,
        createdAt: 'Today, 2:15pm',
      },
    ],
  },
];

const defaultCommissions: Array<Partial<Commission>> = [
  {
    dealName: 'Harbour Health Group',
    client: 'Dr. Evelyn Wei',
    settledAmount: '$420,000',
    rate: '0.74%',
    commissionAmount: '$3,100',
    status: 'Confirmed',
    paidDate: null,
    dealId: 'KRD-2832',
    partnerCode: 'HAYES01',
  },
  {
    dealName: 'Northbank Hospitality',
    client: 'Sofia Rossi',
    settledAmount: '$310,000',
    rate: '1.00%',
    commissionAmount: '$3,100',
    status: 'Confirmed',
    paidDate: null,
    dealId: 'KRD-2788',
    partnerCode: 'HAYES01',
  },
  {
    dealName: 'Bayside Logistics Fleet',
    client: 'Trevor Smith',
    settledAmount: '$540,000',
    rate: '0.70%',
    commissionAmount: '$3,780',
    status: 'Paid',
    paidDate: '10 Sep 2026',
    dealId: 'KRD-2760',
    partnerCode: 'HAYES01',
  },
];

@Injectable()
export class DatabaseSeederService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(
    @InjectModel(Partner.name) private readonly partnerModel: Model<Partner>,
    @InjectModel(Deal.name) private readonly dealModel: Model<Deal>,
    @InjectModel(Commission.name) private readonly commissionModel: Model<Commission>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit() {
    await this.seedUsers();
    await this.seedPartners();
    await this.seedDeals();
    await this.seedCommissions();
  }

  private async seedUsers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const adminEmail = process.env.MASTER_EMAIL || (isProduction ? '' : 'admin@kredo.local');
    const adminPassword = process.env.MASTER_PASSWORD || (isProduction ? '' : 'ChangeMe123!');
    if (!adminEmail || !adminPassword) {
      throw new Error('Set MASTER_EMAIL and MASTER_PASSWORD in the production environment.');
    }

    await this.authService.createSeedUser({
      email: adminEmail,
      password: adminPassword,
      name: 'Kredo Master',
      role: 'master',
    });

    const partnerEmail = process.env.PARTNER_EMAIL || (isProduction ? '' : 'partner@kredo.local');
    const partnerPassword = process.env.PARTNER_PASSWORD || (isProduction ? '' : 'ChangeMe123!');
    if (partnerEmail && partnerPassword) {
      await this.authService.createSeedUser({
        email: partnerEmail,
        password: partnerPassword,
        name: 'Hayes Partners',
        role: 'partner',
        partnerCode: 'HAYES01',
      });
    }

    this.logger.log(isProduction ? 'Seeded configured master account' : 'Seeded default auth users');
  }

  private async seedPartners() {
    for (const partner of defaultPartnerSeed) {
      const existing = await this.partnerModel.findOne({ code: partner.code }).exec();
      if (!existing) {
        await this.partnerModel.create(partner);
      }
    }
  }

  private async seedDeals() {
    for (const deal of defaultDeals) {
      const existing = await this.dealModel.findOne({ id: deal.id }).exec();
      if (!existing) {
        await this.dealModel.create(deal);
      }
    }
  }

  private async seedCommissions() {
    for (const commission of defaultCommissions) {
      const existing = await this.commissionModel.findOne({ dealId: commission.dealId }).exec();
      if (!existing) {
        await this.commissionModel.create(commission);
      }
    }
  }
}
