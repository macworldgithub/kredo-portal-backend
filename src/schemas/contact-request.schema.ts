import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactRequestStatus = 'new' | 'contacted' | 'resolved';

@Schema({ timestamps: true })
export class ContactRequest {
  @Prop({ required: true })
  businessName: string;

  @Prop({ required: true })
  contactName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ type: String, default: 'Website - Talk to Someone' })
  source: string;

  @Prop({ type: String, default: null, nullable: true })
  referralCode?: string | null;

  @Prop({ type: String, default: 'new', enum: ['new', 'contacted', 'resolved'] })
  status: ContactRequestStatus;

  @Prop({ type: String, default: null, nullable: true })
  notes?: string | null;
}

export type ContactRequestDocument = HydratedDocument<ContactRequest>;
export const ContactRequestSchema = SchemaFactory.createForClass(ContactRequest);

