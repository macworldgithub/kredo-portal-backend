import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommissionDocumentStatus = 'Confirmed' | 'Paid' | 'Processing';

@Schema({ timestamps: true })
export class Commission {
  @Prop({ required: true })
  dealName: string;

  @Prop({ required: true })
  client: string;

  @Prop({ required: true })
  settledAmount: string;

  @Prop({ required: true })
  rate: string;

  @Prop({ required: true })
  commissionAmount: string;

  @Prop({ type: String, required: true, enum: ['Confirmed', 'Paid', 'Processing'] })
  status: CommissionDocumentStatus;

  @Prop({ type: String, default: null, nullable: true })
  paidDate?: string | null;

  @Prop({ required: true })
  dealId: string;

  @Prop({ type: String, default: null, nullable: true })
  partnerCode?: string | null;
}

export const CommissionSchema = SchemaFactory.createForClass(Commission);
