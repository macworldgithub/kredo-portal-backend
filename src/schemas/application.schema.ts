import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Application {
  @Prop({ required: true })
  tradingName: string;

  @Prop({ required: true })
  abn: string;

  @Prop({ required: true })
  amount: string;

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true })
  directorName: string;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ type: String, default: null, nullable: true })
  referralCode?: string | null;

  @Prop({ type: String, default: 'new', enum: ['new', 'reviewing', 'approved', 'rejected'] })
  status: 'new' | 'reviewing' | 'approved' | 'rejected';
}

export type ApplicationDocument = HydratedDocument<Application>;
export const ApplicationSchema = SchemaFactory.createForClass(Application);
