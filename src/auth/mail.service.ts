import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    if (!this.config.get<string>('SMTP_HOST') || !this.config.get<string>('EMAIL_FROM')) {
      throw new ServiceUnavailableException('Password recovery email is not configured');
    }
  }

  async sendPasswordResetLink(email: string, resetUrl: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('EMAIL_FROM');
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

    const escapedResetUrl = resetUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    await transporter.sendMail({
      from,
      to: email,
      subject: 'Reset your Kredo password',
      text: `Use this one-time link to reset your Kredo password. It expires in 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this one-time link to reset your Kredo password. It expires in 30 minutes:</p><p><a href="${escapedResetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }
}
