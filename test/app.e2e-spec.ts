import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from './../src/app.module.js';
import { vi } from 'vitest';
import { MailService } from './../src/auth/mail.service.js';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Commission } from './../src/schemas/commission.schema.js';

describe('Kredo portal backend (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let mongoServer: MongoMemoryServer;
  const sendMailTo = vi.fn().mockResolvedValue(undefined);
  let resetCode: string | null = null;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('kredo-portal-e2e');
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.MASTER_EMAIL = 'admin@kredo.local';
    process.env.MASTER_PASSWORD = 'ChangeMe123!';
    process.env.PARTNER_EMAIL = 'partner@kredo.local';
    process.env.PARTNER_PASSWORD = 'ChangeMe123!';
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendMailTo,
        sendFormNotification: async () => undefined,
        sendWelcomeEmail: async () => undefined,
        assertConfigured: () => undefined,
        sendPasswordResetCode: async (_email: string, code: string) => {
          resetCode = code;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin: true, credentials: true });
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }));
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kredo.local', password: 'ChangeMe123!' })
      .expect(200);

    adminToken = loginResponse.body.accessToken;
  });

  it('GET /api/portal/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/portal/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('signs up partner accounts only with an active partner code', async () => {
    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        name: 'New Partner User',
        email: 'new-user@hayes.example',
        password: 'New123',
        partnerCode: 'hayes01',
      })
      .expect(201);

    expect(signup.body.message).toContain('Please sign in');
    expect(signup.body.accessToken).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'new-user@hayes.example', password: 'New123' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        name: 'Invalid Password',
        email: 'invalid-password@hayes.example',
        password: 'bad!xx',
        partnerCode: 'HAYES01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        name: 'Unauthorized Admin',
        email: 'no-partner@example.test',
        password: 'NoCode1',
        partnerCode: 'UNKNOWN',
      })
      .expect(400);
  });

  it('sends a reset code, verifies it, and consumes a single-use reset token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'unknown@hayes.example' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toContain('verification code');
      });

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'new-user@hayes.example' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toContain('verification code');
        expect(body.resetCode).toBeUndefined();
      });

    expect(resetCode).toMatch(/^\d{6}$/);

    await request(app.getHttpServer())
      .post('/api/auth/verify-reset-code')
      .send({ email: 'new-user@hayes.example', code: resetCode === '000000' ? '000001' : '000000' })
      .expect(400);

    const verification = await request(app.getHttpServer())
      .post('/api/auth/verify-reset-code')
      .send({ email: 'new-user@hayes.example', code: resetCode })
      .expect(200);

    const resetToken = verification.body.resetToken as string;
    expect(resetToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/auth/verify-reset-code')
      .send({ email: 'new-user@hayes.example', code: resetCode })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'unverified-token', newPassword: 'Reset1' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'Reset1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'Other2' })
      .expect(400);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'new-user@hayes.example', password: 'Reset1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/update-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'Reset1', newPassword: 'Updat1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'new-user@hayes.example', password: 'Updat1' })
      .expect(200);
  });

  it('logs in and loads dashboard data for partner', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'partner@kredo.local', password: 'ChangeMe123!' })
      .expect(200);

    const token = loginRes.body.accessToken;
    const res = await request(app.getHttpServer())
      .get('/api/portal/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.partner.code).toBe('HAYES01');
    expect(Array.isArray(res.body.deals)).toBe(true);
    expect(res.body.stats).toHaveProperty('referredThisMonth');

    const partnerDeals = await request(app.getHttpServer())
      .get('/api/portal/deals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(partnerDeals.body.every((deal: { name: string }) => deal.name !== 'Alloy Fleet Services')).toBe(true);
    await request(app.getHttpServer())
      .get('/api/portal/deals/KRD-2842')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('creates a direct referral and updates deal status', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/portal/deals/direct')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        businessName: 'Moss & Co Finance',
        contactName: 'Ari Moss',
        email: 'ari@mossco.example',
        phone: '+61 400 111 222',
        amount: '$275000',
        facilityType: 'Asset & Equipment',
        referralCode: 'HAYES01',
      })
      .expect(201);

    expect(createRes.body.id).toMatch(/^KRD-/);
    const dealId = createRes.body.id;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/portal/deals/${dealId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' })
      .expect(200);

    expect(patchRes.body.status).toBe('Approved');
  });

  it('persists finance, authors, reminders and private status updates', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'partner@kredo.local', password: 'ChangeMe123!' }).expect(200);
    const partnerAuth = `Bearer ${login.body.accessToken}`;
    const adminAuth = `Bearer ${adminToken}`;
    const referral = await request(app.getHttpServer()).post('/api/portal/deals/direct')
      .set('Authorization', partnerAuth).send({ businessName: 'Portal Changes Test', contactName: 'John', email: 'john@example.test', phone: '0400000000', amount: '$120,000' }).expect(201);
    const id = referral.body.id;
    expect(referral.body.commission).toBeUndefined();

    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}`)
      .set('Authorization', partnerAuth).send({ lender: 'Shift' }).expect(403);
    const financed = await request(app.getHttpServer()).patch(`/api/portal/deals/${id}`)
      .set('Authorization', adminAuth).send({ lender: 'New Funder', financedAmount: 95000.50 }).expect(200);
    expect(financed.body.lender).toBe('New Funder');
    expect(financed.body.financedAmount).toBe(95000.50);
    expect(financed.body.commission).toBeDefined();
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}`)
      .set('Authorization', adminAuth).send({ financedAmount: -1 }).expect(400);

    const note = await request(app.getHttpServer()).post(`/api/portal/deals/${id}/notes`)
      .set('Authorization', adminAuth).send({ author: 'Elin', content: 'Private commentary', isInternal: true }).expect(201);
    expect(note.body.diaryNotes[0].author).toBe('Elin');
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/notes/${note.body.diaryNotes[0].id}`)
      .set('Authorization', adminAuth).send({ author: 'Martin', content: 'Updated private commentary', isInternal: true }).expect(200);

    await request(app.getHttpServer()).post(`/api/portal/deals/${id}/reminders`)
      .set('Authorization', adminAuth).send({ author: 'Craig', comment: 'Call John for bank statements', dueDate: '2026-11-12' }).expect(400);
    const reminder = await request(app.getHttpServer()).post(`/api/portal/deals/${id}/reminders`)
      .set('Authorization', adminAuth).send({ author: 'Craig', comment: 'Call John for bank statements', dueDate: '2026-11-12', dueTime: '10:45', dueAt: '2026-11-12T05:45:00.000Z' }).expect(201);
    expect(reminder.body.followUpReminders[0].dueTime).toBe('10:45');
    const pipeline = await request(app.getHttpServer()).get('/api/portal/master/pipeline').set('Authorization', adminAuth).expect(200);
    expect(pipeline.body.find((deal: any) => deal.id === id).followUpReminders).toHaveLength(1);
    const done = await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/reminders/${reminder.body.followUpReminders[0].id}`)
      .set('Authorization', adminAuth).send({ completed: true }).expect(200);
    expect(done.body.followUpReminders[0].completed).toBe(true);

    const profile = await request(app.getHttpServer()).get('/api/portal/profile').set('Authorization', partnerAuth).expect(200);
    const { name, contactEmail, phone, bankAccount, bsb, abn } = profile.body;
    const settings = { name, contactEmail, phone, bankAccount, bsb, abn, notificationsEnabled: true, statusUpdateAlerts: false };
    await request(app.getHttpServer()).patch('/api/portal/settings').set('Authorization', partnerAuth).send(settings).expect(200);
    sendMailTo.mockClear();
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/status`).set('Authorization', adminAuth).send({ status: 'Waiting on customer' }).expect(200);
    expect(sendMailTo).not.toHaveBeenCalled();
    let detail = await request(app.getHttpServer()).get(`/api/portal/deals/${id}`).set('Authorization', partnerAuth).expect(200);
    expect(detail.body.statusUpdatedAt).toBeTruthy();
    expect(detail.body.statusSeenAt).toBeUndefined();
    expect(detail.body.commission).toBeUndefined();
    expect(detail.body.diaryNotes).toEqual([]);
    expect(detail.body.followUpReminders).toBeUndefined();
    const seen = await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/status-seen`).set('Authorization', partnerAuth).expect(200);
    expect(seen.body.statusSeenAt).toBe(seen.body.statusUpdatedAt);
    await request(app.getHttpServer()).patch('/api/portal/settings').set('Authorization', partnerAuth).send({ ...settings, statusUpdateAlerts: true }).expect(200);
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/status`).set('Authorization', adminAuth).send({ status: 'Settled' }).expect(200);
    expect(sendMailTo).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/status`).set('Authorization', adminAuth).send({ status: 'Settled' }).expect(200);
    expect(sendMailTo).toHaveBeenCalledTimes(1);
    const dashboard = await request(app.getHttpServer()).get('/api/portal/dashboard').set('Authorization', partnerAuth).expect(200);
    expect(dashboard.body.deals.some((deal: any) => deal.id === id)).toBe(true);
    expect(dashboard.body.stats.totalCommissionsEarned).toBeUndefined();
    const settled = dashboard.body.deals.filter((deal: any) => deal.status === 'Settled');
    expect(dashboard.body.stats.convertedAccounts).toBe(settled.length);
    const total = settled.reduce((sum: number, deal: any) => sum + (deal.financedAmount ?? Number(deal.amount.replace(/[$,]/g, ''))), 0);
    expect(dashboard.body.stats.totalReferralValue).toBe(`$${total.toLocaleString()}`);
    expect(dashboard.body.stats.totalReferralValue.startsWith('$')).toBe(true);
    const listing = await request(app.getHttpServer()).get('/api/portal/deals').set('Authorization', partnerAuth).expect(200);
    expect(dashboard.body.deals).toHaveLength(listing.body.length);
    expect(listing.body.every((deal: any) => deal.commission === undefined && deal.diaryNotes.length === 0)).toBe(true);
    await request(app.getHttpServer()).get('/api/portal/commissions').set('Authorization', partnerAuth).expect(403);
    await request(app.getHttpServer()).patch('/api/portal/deals/KRD-2842/status-seen').set('Authorization', partnerAuth).expect(404);
  });

  it('preserves zero and decimal referral amounts and rejects malformed amounts', async () => {
    const authorization = `Bearer ${adminToken}`;
    const referral = {
      businessName: 'Amount Regression Test', contactName: 'John',
      email: 'john@example.test', phone: '0400000000', referralCode: 'HAYES01',
    };
    for (const amount of ['', '$0', '$1,000.50']) {
      const created = await request(app.getHttpServer()).post('/api/portal/deals/direct')
        .set('Authorization', authorization).send({ ...referral, amount }).expect(201);
      expect(created.body.amount).toBe(amount === '$1,000.50' ? '$1,000.50' : '$0');
      const edited = await request(app.getHttpServer()).patch(`/api/portal/deals/${created.body.id}`)
        .set('Authorization', authorization).send({ amount: '$2,000.25' }).expect(200);
      expect(edited.body.amount).toBe('$2,000.25');
      const zero = await request(app.getHttpServer()).patch(`/api/portal/deals/${created.body.id}`)
        .set('Authorization', authorization).send({ amount: '$0' }).expect(200);
      expect(zero.body.amount).toBe('$0');
    }
    for (const amount of ['-1', '$12abc', '$1,00', '$1.234']) {
      await request(app.getHttpServer()).post('/api/portal/deals/direct')
        .set('Authorization', authorization).send({ ...referral, amount }).expect(400);
    }
  });

  it('creates a settlement ledger entry, preserves adjustments on retries, and repairs missing entries', async () => {
    const authorization = `Bearer ${adminToken}`;
    const created = await request(app.getHttpServer()).post('/api/portal/deals/direct')
      .set('Authorization', authorization).send({
        businessName: 'Ledger Regression Test', contactName: 'John', email: 'john@example.test',
        phone: '0400000000', amount: '$120,000', referralCode: 'HAYES01',
      }).expect(201);
    const id = created.body.id;
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}`)
      .set('Authorization', authorization).send({ financedAmount: 95000.5 }).expect(200);
    const settled = await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/status`)
      .set('Authorization', authorization).send({ status: 'Settled' }).expect(200);
    expect(settled.body.commissionStatus).toBe('Confirmed');
    const ledger = await request(app.getHttpServer()).get('/api/portal/commissions')
      .set('Authorization', authorization).expect(200);
    expect(ledger.body.find((row: any) => row.dealId === id)).toMatchObject({
      settledAmount: '$95,000.50', commissionAmount: '$1,200', status: 'Confirmed',
    });
    const before = await request(app.getHttpServer()).get('/api/portal/master/overview')
      .set('Authorization', authorization).expect(200);
    await request(app.getHttpServer()).patch(`/api/portal/commissions/${id}`)
      .set('Authorization', authorization).send({ commissionAmount: '$777.25', status: 'Paid' }).expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/portal/deals/${id}`)
      .set('Authorization', authorization).expect(200);
    expect(detail.body.commission).toBe('$777.25');
    expect(detail.body.commissionStatus).toBe('Paid');
    const after = await request(app.getHttpServer()).get('/api/portal/master/overview')
      .set('Authorization', authorization).expect(200);
    const toNumber = (value: string) => Number(value.replace(/[$,]/g, ''));
    expect(toNumber(before.body.stats.commissionAccrued) - toNumber(after.body.stats.commissionAccrued)).toBeCloseTo(422.75);
    // Retrying settlement and changing facility details must preserve a paid adjustment.
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}/status`)
      .set('Authorization', authorization).send({ status: 'Settled' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/portal/deals/${id}`)
      .set('Authorization', authorization).send({ amount: '$130,000', financedAmount: 90000 }).expect(200);
    const retried = await request(app.getHttpServer()).get('/api/portal/commissions')
      .set('Authorization', authorization).expect(200);
    const entries = retried.body.filter((row: any) => row.dealId === id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ settledAmount: '$90,000', commissionAmount: '$777.25', status: 'Paid' });
    expect(entries[0].paidDate).toBeTruthy();

    const commissions = app.get<Model<Commission>>(getModelToken(Commission.name));
    await commissions.deleteOne({ dealId: id });
    const repaired = await request(app.getHttpServer()).get('/api/portal/commissions')
      .set('Authorization', authorization).expect(200);
    expect(repaired.body.find((row: any) => row.dealId === id)).toMatchObject({
      commissionAmount: '$777.25', status: 'Paid', settledAmount: '$90,000',
    });
  });

  it('uses the lower bound of an application amount band', async () => {
    await request(app.getHttpServer()).post('/api/portal/applications').send({
      tradingName: 'Amount Band Regression Test', abn: '51824753556', amount: '$50,000 \u2013 $100,000',
      purpose: 'Cashflow assistance', directorName: 'John', email: 'john@example.test',
      phone: '0400000000', referralCode: 'HAYES01',
    }).expect(201);
    const pipeline = await request(app.getHttpServer()).get('/api/portal/master/pipeline')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(pipeline.body.find((deal: any) => deal.name === 'Amount Band Regression Test').commission).toBe('$500');
  });

  it('returns master overview and creates a new partner', async () => {
    const overviewRes = await request(app.getHttpServer())
      .get('/api/portal/master/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(overviewRes.body.stats).toHaveProperty('activePartners');

    const preferenceRes = await request(app.getHttpServer())
      .patch('/api/portal/master/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weeklyReportsEnabled: true })
      .expect(200);
    expect(preferenceRes.body.weeklyReportsEnabled).toBe(true);

    const createPartnerRes = await request(app.getHttpServer())
      .post('/api/portal/master/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tradingName: 'Rowan Advisory',
        primaryContact: 'Tara Rowan',
        email: 'tara@rowanadvisory.com.au',
        partnerType: 'Standard',
        uniqueCode: 'ROWAN7',
      })
      .expect(201);

    expect(createPartnerRes.body.name).toBe('Rowan Advisory');
  });

  afterAll(async () => {
    await app.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });
});
