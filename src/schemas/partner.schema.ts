import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PartnerDocument = HydratedDocument<Partner>;

@Schema({ timestamps: true })
export class Partner {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true })
  code: string;

  @Prop({ default: 'Commercial & Business Broking' })
  partnerType: string;

  @Prop({ required: true, lowercase: true })
  contactEmail: string;

  @Prop({ default: '+61 412 849 201' })
  phone: string;

  @Prop({ default: '1098 4421' })
  bankAccount: string;

  @Prop({ default: '062-000' })
  bsb: string;

  @Prop({ default: '48 192 847 219' })
  abn: string;

  @Prop({ default: 'kredo.au/apply?ref=HAYES01' })
  referralLink: string;

  @Prop({ default: true })
  notificationsEnabled: boolean;

  @Prop({ default: true })
  settlementAlerts: boolean;

  @Prop({ default: false })
  marketingEmails: boolean;

  @Prop({ type: String, default: 'active', enum: ['active', 'paused'] })
  status: 'active' | 'paused';

  @Prop({ default: false })
  isHero: boolean;
}

export const PartnerSchema = SchemaFactory.createForClass(Partner);
