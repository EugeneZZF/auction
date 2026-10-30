import { Module } from '@nestjs/common';
import { MailModule } from './mail.module';
import { FeedbackController } from './feedback.controller';

@Module({
  imports: [MailModule],
  controllers: [FeedbackController],
})
export class FeedbackModule {}
