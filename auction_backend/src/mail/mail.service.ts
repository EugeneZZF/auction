import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly feedbackRecipient: string;
  private readonly isConfigured: boolean;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(config.get<string>('SMTP_PORT', '587'));
    const secureSetting = config.get<string>('SMTP_SECURE');
    const user = config.get<string>('SMTP_USER', '').trim();
    const password = config.get<string>('SMTP_PASS', '').replace(/\s+/g, '');

    this.isConfigured = Boolean(user && password);
    this.from = config.get<string>('SMTP_FROM', user).trim() || user;
    this.feedbackRecipient =
      config.get<string>('FEEDBACK_TO', user).trim() || user;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: secureSetting ? secureSetting === 'true' : port === 465,
      auth: this.isConfigured ? { user, pass: password } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async sendLoginCode(email: string, code: string): Promise<void> {
    if (!this.isConfigured || !this.from) {
      throw new ServiceUnavailableException(
        'Почта не настроена. Укажи SMTP_USER, SMTP_PASS и SMTP_FROM в .env',
      );
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Код подтверждения GoldenDay',
        text: `Код подтверждения: ${code}. Он действует 5 минут. Если вы не входили в GoldenDay, проигнорируйте это письмо.`,
        html: `<div style="font-family:Arial,sans-serif;color:#111"><h2>Вход в GoldenDay</h2><p>Введите этот код, чтобы завершить вход:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Код действует 5 минут. Если вы не входили в GoldenDay, проигнорируйте это письмо.</p></div>`,
      });
    } catch (error) {
      this.logger.error(
        'Не удалось отправить письмо с кодом подтверждения',
        error instanceof Error ? error.message : undefined,
      );
      throw new ServiceUnavailableException(
        'Не удалось отправить письмо. Проверь настройки SMTP и попробуй ещё раз.',
      );
    }
  }

  async sendFeedback(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<void> {
    if (!this.isConfigured || !this.from || !this.feedbackRecipient) {
      throw new ServiceUnavailableException(
        'Почтовый сервис пока недоступен. Попробуйте позже.',
      );
    }

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] as string);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: this.feedbackRecipient,
        replyTo: input.email,
        subject: `[GoldenDay] ${input.subject}`,
        text: `Имя: ${input.name}\nEmail для ответа: ${input.email}\n\n${input.message}`,
        html: `<div style="font-family:Arial,sans-serif;color:#17211c"><h2>Сообщение с сайта GoldenDay</h2><p><b>Имя:</b> ${escapeHtml(input.name)}</p><p><b>Email для ответа:</b> ${escapeHtml(input.email)}</p><p><b>Тема:</b> ${escapeHtml(input.subject)}</p><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p></div>`,
      });
    } catch (error) {
      this.logger.error(
        'Не удалось отправить сообщение обратной связи',
        error instanceof Error ? error.message : undefined,
      );
      throw new ServiceUnavailableException(
        'Не удалось отправить сообщение. Попробуйте позже.',
      );
    }
  }
}
