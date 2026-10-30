import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from './redis.service';
import { BiddingGateway } from './bidding.gateway';
import { BotService } from '../bots/bot.service';

// Базовое значение по умолчанию, но фактическое окно берётся из lot.inactivityTimeoutMs
const DEFAULT_INACTIVITY_TIMEOUT_MS = 10_000;
const BOT_TICK_MS = 2_000; // как часто бот попытается поставить ставку

@Injectable()
export class AuctionSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AuctionSchedulerService.name);
  private botIntervalHandle: NodeJS.Timer | null = null;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private gateway: BiddingGateway,
    private bots: BotService,
  ) {}

  async onModuleInit() {
    await this.bots.hydrateBotPool();
    this.startBotTicker();
  }

  private startBotTicker() {
    if (this.botIntervalHandle) return;
    this.botIntervalHandle = setInterval(() => {
      void this.tickBots().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Ошибка в тикере ботов: ${message}`);
      });
    }, BOT_TICK_MS);
  }

  // Логика: если сумма реальных ставок по лоту меньше basePrice, боты могут продлевать активность, делая ставки
  private async tickBots(): Promise<void> {
    const activeLots = await this.prisma.lot.findMany({
      where: { isActive: true, isFinished: false },
    });
    const now = Date.now();

    for (const lot of activeLots) {
      const lastBidAt = await this.redis.getLastBidAt(lot.id);
      const timeoutMs =
        lot.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
      const realSpent = await this.redis.getRealSpent(lot.id); // в копейках
      console.log('basePrice', lot.basePrice);
      const titleRow = await this.prisma.lot.findUnique({
        where: { id: lot.id },
        select: { title: true },
      });
      const title = titleRow?.title ?? '';
      console.log('lot', title, 'realSpent', realSpent);

      // Проверяем закрытие по неактивности
      if (lastBidAt && now - lastBidAt >= timeoutMs) {
        await this.tryCloseLotByInactivity(lot.id);
        continue;
      }

      // Боты поддерживают активность, пока сумма реальных ставок не превысит цену лота
      // Как только realSpent > basePrice — боты перестают ставить
      if (lot.botsEnabled && realSpent <= lot.basePrice) {
        await this.bots.placeBotBid(lot.id);
      }

      // Проверяем лимиты ставок для всех пользователей с автоставками на этом лоте
      await this.checkUserBidLimits(lot.id);

      // Проверяем и запускаем автоставки в критическое время
      await this.checkAndProcessAutoBids(lot.id);
    }
  }

  // Проверка лимитов ставок для пользователей с автоставками
  private async checkUserBidLimits(lotId: string): Promise<void> {
    try {
      const autoBidders = await this.redis.getAutoBidders(lotId);
      
      for (const userId of autoBidders) {
        // Проверяем лимит для каждого пользователя
        const limitReached = await this.redis.checkUserBidLimitAndDisableAutoBid(userId, lotId);
        if (limitReached) {
          this.logger.log(`🚫 Автоставка пользователя ${userId} отключена по достижению лимита на лоте ${lotId}`);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка при проверке лимитов ставок для лота ${lotId}: ${message}`);
    }
  }

  // Проверка и запуск автоставок в критическое время
  private async checkAndProcessAutoBids(lotId: string): Promise<void> {
    try {
      // Проверяем, находится ли лот в критическом времени (1-3 секунды до окончания)
      const isInCriticalTime = await this.redis.isInCriticalTime(lotId);
      const timeUntilEnd = await this.redis.getTimeUntilEnd(lotId);
      
      if (isInCriticalTime) {
        this.logger.log(`⏰ Критическое время для лота ${lotId}: ${timeUntilEnd}мс до окончания`);
        
        // Запускаем обработку автоставок через gateway
        await this.gateway.processAutoBids(lotId);
      } else {
        // Логируем только если время близко к критическому (для отладки)
        if (timeUntilEnd <= 5000 && timeUntilEnd > 0) {
          this.logger.log(`⏰ Лот ${lotId}: ${timeUntilEnd}мс до окончания (не критическое время)`);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка при проверке автоставок для лота ${lotId}: ${message}`);
    }
  }

  // Завершение лота: победитель — текущий лидер в Redis
  private async tryCloseLotByInactivity(lotId: string): Promise<void> {
    const lockKey = `lock:lot:${lotId}:close`;
    const acquired = await this.redis.acquireLock(lockKey, 5);
    if (!acquired) return;

    try {
      // Сначала закрываем лот в БД. Ставка берёт ту же строку лота под блокировку,
      // поэтому все принятые до закрытия ставки попадут в итоговый список.
      const closedLot = await this.prisma.lot.updateMany({
        where: { id: lotId, isActive: true, isFinished: false },
        data: { isActive: false, isFinished: true },
      });
      if (closedLot.count !== 1) return;

      const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
      if (!lot) return;

      const lotBids = await this.redis.getLotBids(lotId);
      const winnerBid =
        lotBids.recentBids.length > 0 ? lotBids.recentBids[0] : null;

      if (winnerBid) {
        // Записываем победу только если победитель — реальный пользователь
        const realUser = await this.prisma.user.findUnique({
          where: { id: winnerBid.userId },
          select: { id: true },
        });
        if (realUser) {
          // Яркое лог-сообщение о победе пользователя
          this.logger.log(
            `
🏆🏆🏆 ПОБЕДА ПОЛЬЗОВАТЕЛЯ 🏆🏆🏆
Лот: ${lot.title} (${lotId})
Победитель: ${winnerBid.userName} (${winnerBid.userId})
Ставок в последнем действии: ${winnerBid.bidCount}
⏱️ Причина завершения: 10с без активности
`,
          );

          await this.prisma.wins.create({
            data: {
              lotId,
              userId: winnerBid.userId,
            },
          });

          // Опциональная пауза для изучения логов
          if (process.env.PAUSE_ON_USER_WIN === 'true') {
            this.logger.warn(
              '⏸️ Пауза включена (PAUSE_ON_USER_WIN=true). Процесс остановлен для изучения логов.',
            );
            // eslint-disable-next-line no-debugger
            debugger;
            // Бесконечное ожидание, чтобы "заморозить" процесс
            await new Promise<never>(() => {
              /* noop */
            });
          }
        } else {
          this.logger.log(
            `🤖 Победитель — бот (${winnerBid.userName}). Запись в Wins пропущена`,
          );
        }
      }

      // Перед стартом нового розыгрыша отключаем автоставки у всех пользователей на этом лоте
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await this.redis.disableAllAutoBidsForLot(lotId);

      // Очищаем временные данные ставок: завершённый лот больше не переходит в новый раунд.
      await this.redis.clearLotData(lotId);

      // Уведомляем комнату лота о завершении
      await this.gateway.broadcastLotClosed(lotId, winnerBid);

      this.logger.log(
        `🔒 Лот ${lotId} окончательно закрыт по неактивности. Победитель: ${winnerBid?.userName ?? 'нет'}`,
      );
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }
}
