import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('EMAIL_FROM')?.trim()
      || this.config.get<string>('SMTP_USER')?.trim();
    if (!host || !from) {
      throw new ServiceUnavailableException('Password recovery email is not configured');
    }
  }

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('EMAIL_FROM')?.trim()
      || this.config.get<string>('SMTP_USER')?.trim();
    this.assertConfigured();
    if (!host || !from) throw new ServiceUnavailableException('Password recovery email is not configured');

    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Your Kredo password reset code',
      text: `Your Kredo password reset verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your Kredo password reset verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    });
  }
}
