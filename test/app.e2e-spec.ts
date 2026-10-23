import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from './../src/app.module.js';
import { MailService } from './../src/auth/mail.service.js';

describe('Kredo portal backend (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let mongoServer: MongoMemoryServer;
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
