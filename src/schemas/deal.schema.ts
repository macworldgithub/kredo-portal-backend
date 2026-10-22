import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DealStatus = 'In assessment' | 'Approved' | 'Docs / settlement' | 'Settled' | 'Declined' | 'Application received' | 'Declined / withdrawn';

export type CommissionStatus = 'Estimated' | 'Confirmed' | 'Paid';

@Schema({ timestamps: true })
export class Deal {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  applicant: string;

  @Prop({ required: true })
  amount: string;

  @Prop({ required: true, default: 0 })
  amountValue: number;

  @Prop({ required: true })
  type: string;

  @Prop({ type: String, required: true, enum: ['In assessment', 'Approved', 'Docs / settlement', 'Settled', 'Declined', 'Application received', 'Declined / withdrawn'] })
  status: DealStatus;

  @Prop({ required: true })
  lastActivity: string;

  @Prop({ required: true })
  commission: string;

  @Prop({ type: String, required: true, enum: ['Estimated', 'Confirmed', 'Paid'] })
  commissionStatus: CommissionStatus;

  @Prop({ required: true, uppercase: true })
  code: string;

  @Prop({ required: true })
  submittedDate: string;

  @Prop({ type: String, default: 'partner', enum: ['partner', 'hero', 'typed-code', 'direct'] })
  source: 'partner' | 'hero' | 'typed-code' | 'direct';

  @Prop({ type: String, default: null, nullable: true })
  partnerId?: string | null;
}

export const DealSchema = SchemaFactory.createForClass(Deal);
