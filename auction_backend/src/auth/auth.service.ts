import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from 'src/prisma.service';
import { AuthDto } from './dto/auth.dto';
import { hash, verify } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginCodeDto } from './dto/verify-login-code.dto';
import { ResendLoginCodeDto } from './dto/resend-login-code.dto';
import { MailService } from '../mail/mail.service';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AuthService {
  private readonly CODE_TTL_MS = 5 * 60 * 1000;
  private readonly CODE_MAX_ATTEMPTS = 5;
  private readonly CODE_RESEND_DELAY_MS = 60 * 1000;
  private readonly CODE_MAX_RESENDS = 3;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto);
    return this.createLoginChallenge(user);
  }

  async verifyLoginCode(dto: VerifyLoginCodeDto) {
    const now = new Date();
    const challenge = await this.prisma.emailLoginChallenge.findUnique({
      where: { id: dto.challengeId },
      include: { user: true },
    });

    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= this.CODE_MAX_ATTEMPTS
    ) {
      throw new UnauthorizedException('Неверный или просроченный код');
    }

    const expectedHash = Buffer.from(challenge.codeHash, 'hex');
    const submittedHash = Buffer.from(
      this.hashLoginCode(challenge.id, dto.code),
      'hex',
    );

    if (!timingSafeEqual(expectedHash, submittedHash)) {
      await this.prisma.emailLoginChallenge.updateMany({
        where: {
          id: challenge.id,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: this.CODE_MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Неверный или просроченный код');
    }

    const consumed = await this.prisma.emailLoginChallenge.updateMany({
      where: {
        id: challenge.id,
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: this.CODE_MAX_ATTEMPTS },
      },
      data: { usedAt: now },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedException('Неверный или просроченный код');
    }

    return {
      user: this.returnUserFields(challenge.user),
      ...(await this.issueTokens(challenge.userId)),
    };
  }

  async resendLoginCode(dto: ResendLoginCodeDto) {
    const now = new Date();
    const challenge = await this.prisma.emailLoginChallenge.findUnique({
      where: { id: dto.challengeId },
      include: { user: true },
    });

    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= this.CODE_MAX_ATTEMPTS
    ) {
      throw new UnauthorizedException('Запрос на подтверждение истёк. Войди снова.');
    }

    if (challenge.resendCount >= this.CODE_MAX_RESENDS) {
      throw new HttpException(
        'Лимит повторной отправки исчерпан. Войди снова через минуту.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const nextSendAt = new Date(
      challenge.lastSentAt.getTime() + this.CODE_RESEND_DELAY_MS,
    );
    if (nextSendAt > now) {
      throw new HttpException(
        `Повторно отправить код можно через ${Math.ceil((nextSendAt.getTime() - now.getTime()) / 1000)} сек.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    const expiresAt = new Date(now.getTime() + this.CODE_TTL_MS);
    const updated = await this.prisma.emailLoginChallenge.updateMany({
      where: {
        id: challenge.id,
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: this.CODE_MAX_ATTEMPTS },
        resendCount: { lt: this.CODE_MAX_RESENDS },
        lastSentAt: { lte: new Date(now.getTime() - this.CODE_RESEND_DELAY_MS) },
      },
      data: {
        codeHash: this.hashLoginCode(challenge.id, code),
        expiresAt,
        attempts: 0,
        resendCount: { increment: 1 },
        lastSentAt: now,
      },
    });

    if (updated.count !== 1) {
      throw new HttpException(
        'Не удалось повторно отправить код. Запрос уже использован или истёк.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.mail.sendLoginCode(challenge.user.email, code);

    return {
      challengeId: challenge.id,
      email: challenge.user.email,
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + this.CODE_RESEND_DELAY_MS),
      resendsRemaining: this.CODE_MAX_RESENDS - challenge.resendCount - 1,
    };
  }

  async getNewTokens(refreshToken: string) {
    const result = await this.jwt.verifyAsync(refreshToken);

    if (!result) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.prisma.user.findUnique({
      where: {
        id: result.id,
      },
    });

    if (!user) throw new NotFoundException('User not found'); // нужно добавить проверку

    return this.createLoginChallenge(user);
  }

  private async createLoginChallenge(user: User) {
    const now = new Date();
    const resendWindowStart = new Date(
      now.getTime() - this.CODE_RESEND_DELAY_MS,
    );
    const recentChallenge = await this.prisma.emailLoginChallenge.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        lastSentAt: { gt: resendWindowStart },
      },
      orderBy: { lastSentAt: 'desc' },
    });

    if (recentChallenge) {
      if (
        recentChallenge.expiresAt > now &&
        recentChallenge.attempts < this.CODE_MAX_ATTEMPTS
      ) {
        return {
          twoFactorRequired: true,
          challengeId: recentChallenge.id,
          email: user.email,
          expiresAt: recentChallenge.expiresAt,
          resendAvailableAt: new Date(
            recentChallenge.lastSentAt.getTime() + this.CODE_RESEND_DELAY_MS,
          ),
          resendsRemaining: this.CODE_MAX_RESENDS - recentChallenge.resendCount,
        };
      }

      throw new HttpException(
        'Слишком много запросов. Подожди минуту и попробуй снова.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const challengeId = randomUUID();
    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    const expiresAt = new Date(now.getTime() + this.CODE_TTL_MS);

    await this.prisma.emailLoginChallenge.create({
      data: {
        id: challengeId,
        userId: user.id,
        codeHash: this.hashLoginCode(challengeId, code),
        expiresAt,
      },
    });

    try {
      await this.mail.sendLoginCode(user.email, code);
    } catch (error) {
      await this.prisma.emailLoginChallenge.deleteMany({
        where: { id: challengeId, usedAt: null },
      });
      throw error;
    }

    return {
      twoFactorRequired: true,
      challengeId,
      email: user.email,
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + this.CODE_RESEND_DELAY_MS),
      resendsRemaining: this.CODE_MAX_RESENDS,
    };
  }

  private hashLoginCode(challengeId: string, code: string) {
    const secret = this.config.getOrThrow<string>('OTP_HASH_SECRET');
    return createHmac('sha256', secret)
      .update(`${challengeId}:${code}`)
      .digest('hex');
  }

  async register(dto: AuthDto) {
    const oldUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (oldUser) throw new BadRequestException('User already exists');

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: await hash(dto.password),
      },
    });

    const tokens = await this.issueTokens(user.id);

    return {
      user: this.returnUserFields(user),
      ...tokens,
    };
  }

  async grantAdminRole(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (!existingUser) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { email: normalizedEmail },
      data: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  }

  async searchAdminUsers(search?: string) {
    const query = search?.trim().slice(0, 100);
    return this.prisma.user.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        balance: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async addUserBalance(userId: string, amountRubles: number) {
    const amountKopecks = amountRubles * 100;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.balance > 2_147_483_647 - amountKopecks) {
      throw new BadRequestException('Сумма превышает допустимый баланс');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: amountKopecks } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        balance: true,
        createdAt: true,
      },
    });
  }

  async updateAdminUser(userId: string, dto: UpdateAdminUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const normalizedEmail = dto.email?.trim().toLowerCase();
    if (!normalizedEmail && !dto.password) {
      throw new BadRequestException('Укажите новый email или пароль');
    }

    if (normalizedEmail && normalizedEmail !== user.email.toLowerCase()) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (emailOwner) throw new BadRequestException('Этот email уже занят');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(dto.password ? { password: await hash(dto.password) } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        balance: true,
        createdAt: true,
      },
    });
  }

  private async issueTokens(userId: string) {
    const data = { id: userId };

    const accessToken = this.jwt.sign(data, {
      expiresIn: '7d',
    });

    const refreshToken = this.jwt.sign(data, {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private returnUserFields(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      balance: user.balance,
      bids: user.bids,
    };
  }

  private async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const isValid = await verify(user.password, dto.password);

    if (!isValid) throw new UnauthorizedException('Invalid password');

    return user;
  }

  async getUserWins(user: User) {
    // Получаем все выигрыши пользователя с информацией о лотах
    const wins = await this.prisma.wins.findMany({
      where: { userId: user.id },
      include: {
        lot: {
          select: {
            id: true,
            title: true,
            description: true,
            image: true,
            basePrice: true,
            periodSeconds: true,
            currentStart: true,
            currentEnd: true,
            isActive: true,
            inactivityTimeoutMs: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        wonAt: 'desc', // Сортируем по дате выигрыша (новые сначала)
      },
    });
  
    // Возвращаем каждый выигрыш отдельно
    return wins.map((win) => ({
      id: win.id,           // ID выигрыша
      lotId: win.lotId,     // ID лота
      wonAt: win.wonAt,     // Дата выигрыша
      lot: win.lot,         // Информация о лоте
    }));
  }

  async getUserProfile(user: User) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        balance: true,
        bids: true,
        createdAt: true,
      },
    });
  }

  async getUserBidHistory(user: User) {
    return this.prisma.bidHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        bidCount: true,
        createdAt: true,
        lot: {
          select: {
            id: true,
            title: true,
            image: true,
            basePrice: true,
          },
        },
      },
    });
  }
}
