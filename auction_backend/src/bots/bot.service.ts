import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BiddingService } from '../bidding/bidding.service';
import { BiddingGateway } from '../bidding/bidding.gateway';
import { faker } from '@faker-js/faker';

interface BotProfile {
  id: string;
  name: string;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private botProfiles: BotProfile[] = [];

  constructor(
    private prisma: PrismaService,
    private bidding: BiddingService,
    private gateway: BiddingGateway,
  ) {}

  // Регистрируем доступных ботов из отдельной таблицы Bot
  async hydrateBotPool(): Promise<void> {
    let bots = await this.prisma.bot.findMany({
      select: { id: true, name: true },
      take: 200,
    });
    if (bots.length === 0) {
      // Автосидинг: создадим 20 ботов со случайными именами
      const names = Array.from({ length: 20 }).map(() =>
        faker.person.fullName(),
      );
      await this.prisma.bot.createMany({
        data: names.map((name) => ({ name })),
        skipDuplicates: true,
      });
      bots = await this.prisma.bot.findMany({
        select: { id: true, name: true },
        take: 200,
      });
      this.logger.log(`🤖 Автосоздано ботов: ${bots.length}`);
    }
    this.botProfiles = bots;
    this.logger.log(`🤖 Загружено ботов: ${bots.length}`);
  }

  async refreshBotPool(): Promise<void> {
    this.botProfiles = await this.prisma.bot.findMany({
      select: { id: true, name: true },
      take: 200,
    });
  }

  // Выбор случайного бота из пула
  pickRandomBot(): BotProfile | null {
    if (this.botProfiles.length === 0) return null;
    const idx = Math.floor(Math.random() * this.botProfiles.length);
    return this.botProfiles[idx];
  }

  // Бот делает одну ставку (1 bidCount), возвращает true если удалось
  async placeBotBid(lotId: string): Promise<boolean> {
    const bot = this.pickRandomBot();
    if (!bot) {
      this.logger.warn('🤖 Нет доступных ботов для ставки');
      return false;
    }

    try {
      const result = await this.bidding.placeBotBid(bot.id, bot.name, {
        lotId,
        bidCount: 1,
      });
      await this.gateway.broadcastBidPlaced(lotId, result.lotBids, {
        userId: bot.id,
        userName: bot.name,
        bidCount: 1,
        timestamp: Date.now(),
      }); // для ботов не передаем updatedUser, так как у них нет баланса
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`🤖 Бот не смог поставить на лот ${lotId}: ${message}`);
      return false;
    }
  }
}
