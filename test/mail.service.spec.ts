import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../src/auth/mail.service.js';

describe('MailService', () => {
  it('uses the SMTP username when EMAIL_FROM is not set', async () => {
    const module = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => ({
              SMTP_HOST: 'smtp.example.test',
              SMTP_USER: 'sender@example.test',
            })[key],
          },
        },
      ],
    }).compile();

    expect(() => module.get(MailService).assertConfigured()).not.toThrow();
    await module.close();
  });

  it('requires a configured SMTP host and sender address', async () => {
    const module = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => ({
              SMTP_HOST: 'smtp.example.test',
            })[key],
          },
        },
      ],
    }).compile();

    expect(() => module.get(MailService).assertConfigured())
      .toThrow(ServiceUnavailableException);
    await module.close();
  });
});
