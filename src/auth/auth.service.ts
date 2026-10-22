import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './user.schema.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).exec();
    if (!user) {
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

  async registerUser(input: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    partnerCode?: string | null;
  }) {
    const email = input.email.toLowerCase();
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      throw new UnauthorizedException('User already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.userModel.create({
      email,
      passwordHash,
      role: input.role,
      name: input.name,
      partnerCode: input.partnerCode ?? null,
      isActive: true,
    });

    return this.login(input.email, input.password);
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
