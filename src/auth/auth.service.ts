import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from './user.schema.js';
import { Partner } from '../schemas/partner.schema.js';
import { MailService } from './mail.service.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Partner.name) private readonly partnerModel: Model<Partner>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).exec();
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      partnerCode: user.partnerCode,
    };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        partnerCode: user.partnerCode,
      },
    };
  }

  async registerPartner(input: {
    email: string;
    password: string;
    name: string;
    partnerCode: string;
  }) {
    const email = input.email.toLowerCase();
    const partnerCode = input.partnerCode.trim().toUpperCase();
    const [existing, partner] = await Promise.all([
      this.userModel.findOne({ email }).exec(),
      this.partnerModel.findOne({ code: partnerCode, status: 'active' }).exec(),
    ]);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    if (!partner) {
      throw new BadRequestException('Enter a valid, active partner code');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    await this.userModel.create({
      email,
      passwordHash,
      role: 'partner',
      name: input.name,
      partnerCode,
      isActive: true,
    });

    return this.login(email, input.password);
  }

  async requestPasswordReset(emailInput: string): Promise<{ message: string }> {
    this.mailService.assertConfigured();
    const email = emailInput.toLowerCase();
    const user = await this.userModel.findOne({ email, isActive: true }).exec();
    const response = {
      message: 'If an account exists for this email, a password reset link has been sent.',
    };
    if (!user) return response;

    const rawToken = randomBytes(32).toString('hex');
    user.passwordResetTokenHash = this.hashResetToken(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const resetUrl = new URL('/reset-password', frontendUrl);
    resetUrl.searchParams.set('token', rawToken);
    try {
      await this.mailService.sendPasswordResetLink(email, resetUrl.toString());
    } catch (error) {
      user.passwordResetTokenHash = null;
      user.passwordResetExpiresAt = null;
      await user.save();
      throw error;
    }
    return response;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userModel.findOne({
      passwordResetTokenHash: this.hashResetToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
      isActive: true,
    }).exec();
    if (!user) {
      throw new BadRequestException('Password reset link is invalid or has expired');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();
    return { message: 'Password has been reset. You can now sign in.' };
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.isActive) throw new NotFoundException('User account not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();
    return { message: 'Password updated successfully' };
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSeedUser(input: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    partnerCode?: string | null;
  }) {
    const email = input.email.toLowerCase();
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      return existing;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    return this.userModel.create({
      email,
      passwordHash,
      role: input.role,
      name: input.name,
      partnerCode: input.partnerCode ?? null,
      isActive: true,
    });
  }
}
