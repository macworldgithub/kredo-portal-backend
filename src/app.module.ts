import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PortalModule } from './portal/portal.module.js';
import { DatabaseSeederService } from './seed/seed.service.js';
import { Partner, PartnerSchema } from './schemas/partner.schema.js';
import { Deal, DealSchema } from './schemas/deal.schema.js';
import { Commission, CommissionSchema } from './schemas/commission.schema.js';
import { User, UserSchema } from './auth/user.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');
        if (process.env.NODE_ENV === 'production' && !uri) {
          throw new Error('MONGODB_URI must be configured in production.');
        }
        return {
          uri: uri || 'mongodb://127.0.0.1:27017/kredo-portal',
          autoIndex: true,
        };
      },
    }),
    MongooseModule.forFeature([
      { name: Partner.name, schema: PartnerSchema },
      { name: Deal.name, schema: DealSchema },
      { name: Commission.name, schema: CommissionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseSeederService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
