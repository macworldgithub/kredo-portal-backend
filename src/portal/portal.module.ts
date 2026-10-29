import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { User, UserSchema } from '../auth/user.schema.js';
import { Application, ApplicationSchema } from '../schemas/application.schema.js';
import { Commission, CommissionSchema } from '../schemas/commission.schema.js';
import { Deal, DealSchema } from '../schemas/deal.schema.js';
import { Partner, PartnerSchema } from '../schemas/partner.schema.js';
import { ContactRequest, ContactRequestSchema } from '../schemas/contact-request.schema.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Partner.name, schema: PartnerSchema },
      { name: Deal.name, schema: DealSchema },
      { name: Commission.name, schema: CommissionSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: ContactRequest.name, schema: ContactRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [PortalService, RolesGuard],
  controllers: [PortalController],
  exports: [PortalService],
})
export class PortalModule {}
