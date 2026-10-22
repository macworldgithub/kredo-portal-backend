import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from './../src/app.module.js';

describe('Kredo portal backend (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('kredo-portal-e2e');
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.MASTER_EMAIL = 'admin@kredo.local';
    process.env.MASTER_PASSWORD = 'ChangeMe123!';
    process.env.PARTNER_EMAIL = 'partner@kredo.local';
    process.env.PARTNER_PASSWORD = 'ChangeMe123!';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin: true, credentials: true });
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
