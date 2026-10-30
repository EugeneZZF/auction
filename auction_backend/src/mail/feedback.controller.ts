import { Body, Controller, HttpCode, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { MailService } from './mail.service';
import { FeedbackDto } from './feedback.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly mailService: MailService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async send(@Body() dto: FeedbackDto) {
    await this.mailService.sendFeedback(dto);
    return { message: 'Сообщение отправлено. Спасибо за обратную связь!' };
  }
}
