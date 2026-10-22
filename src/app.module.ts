import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI') || 'mongodb://127.0.0.1:27017/kredo-portal',
        autoIndex: true,
      }),
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
  providers: [AppService, DatabaseSeederService],
})
export class AppModule {}
