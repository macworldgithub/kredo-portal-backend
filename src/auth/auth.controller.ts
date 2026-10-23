import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class SignupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{6}$/, {
    message: 'Password must be exactly 6 letters and/or digits, with no symbols or spaces',
  })
  password: string;

  @IsNotEmpty()
  @IsString()
  partnerCode: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{6}$/, {
    message: 'New password must be exactly 6 letters and/or digits, with no symbols or spaces',
  })
  newPassword: string;
}

class UpdatePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{6}$/, {
    message: 'New password must be exactly 6 letters and/or digits, with no symbols or spaces',
  })
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto) {
    return this.authService.registerPartner({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      partnerCode: dto.partnerCode,
    });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('update-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updatePassword(@Req() req: any, @Body() dto: UpdatePasswordDto) {
    return this.authService.updatePassword(req.user.sub, dto.currentPassword, dto.newPassword);
  }
}
