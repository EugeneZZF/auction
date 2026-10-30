import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma.service';

export interface BidInfo {
  userId: string;
  userName: string;
  bidCount: number;
  timestamp: number;
}

export interface LotBids {
  lotId: string;
  totalBids: number;
  currentLeader: {
    userId: string;
    userName: string;
    bidCount: number;
  } | null;
  recentBids: BidInfo[];
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly BID_EXPIRY = 3600; // 1 час в секундах
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly prisma: PrismaService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.logger.log('🔗 Redis подключение инициализировано');
  }

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('🔌 Redis соединение закрыто');
  }

  // Добавление ставки
  async addBid(
    lotId: string,
    userId: string,
    userName: string,
    bidCount: number,
  ): Promise<LotBids> {
    const title = await this.getLotTitle(lotId);
    this.logger.log(
      `➕ Добавление ставки: [${title}] ${lotId}, пользователь ${userName} (${userId}), ставок ${bidCount}`,
    );

    const timestamp = Date.now();
    const bidKey = `lot:${lotId}:bids`;
    const userKey = `lot:${lotId}:user:${userId}`;

    // Добавляем ставку пользователя
    const bidInfo: BidInfo = {
      userId,
      userName: userName || 'Неизвестный пользователь',
      bidCount,
      timestamp,
    };

    try {
      // Сохраняем/обновляем данные пользователя и инкрементим общий счётчик его ставок на лоте
      await this.redis.hset(userKey, {
        userId,
        userName: userName || 'Неизвестный пользователь',
        timestamp: timestamp.toString(),
      });
      await this.redis.hincrby(userKey, 'bidCount', bidCount);
      await this.redis.expire(userKey, this.BID_EXPIRY);
      this.logger.log(`💾 Данные пользователя сохранены в Redis: ${userKey}`);

      // Добавляем в список всех ставок (последние 50)
      await this.redis.lpush(`${bidKey}:recent`, JSON.stringify(bidInfo));
      await this.redis.ltrim(`${bidKey}:recent`, 0, 49); // Оставляем только последние 50 ставок
      await this.redis.expire(`${bidKey}:recent`, this.BID_EXPIRY);
      this.logger.log(
        `📝 Ставка добавлена в список недавних: ${bidKey}:recent`,
      );

      // Обновляем общее количество ставок
      const totalBids = await this.redis.incrby(`${bidKey}:total`, bidCount);
      await this.redis.expire(`${bidKey}:total`, this.BID_EXPIRY);
      this.logger.log(`📊 Общее количество ставок обновлено: ${totalBids}`);

      // Обновляем лидера
      await this.updateLeader(lotId);

      // Обновляем таймстамп последней ставки
      await this.setLastBidAt(lotId, timestamp);

      const result = await this.getLotBids(lotId);
      this.logger.log(
        `✅ Ставка успешно добавлена. Итого на лоте [${title}]: ${result.totalBids} ставок`,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка при добавлении ставки в Redis: ${message}`);
      throw error;
    }
  }

  // Обновление лидера лота
  private async updateLeader(lotId: string): Promise<void> {
    const title = await this.getLotTitle(lotId);
    this.logger.log(`👑 Обновление лидера для лота [${title}] ${lotId}`);

    const bidKey = `lot:${lotId}:bids`;
    const userKeys = await this.redis.keys(`lot:${lotId}:user:*`);

    this.logger.log(
      `🔍 Найдено ${userKeys.length} пользователей на лоте ${lotId}`,
    );

    let maxBids = 0;
    let leader: { userId: string; userName: string; bidCount: number } | null =
      null;

    for (const userKey of userKeys) {
      const userData = await this.redis.hgetall(userKey);
      if (userData.userId && userData.bidCount && userData.userName) {
        const bidCount = parseInt(userData.bidCount);
        this.logger.log(`👤 ${userData.userName}: ${bidCount} ставок`);

        if (bidCount > maxBids) {
          maxBids = bidCount;
          leader = {
            userId: userData.userId,
            userName: userData.userName,
            bidCount,
          };
        }
      }
    }

    // Сохраняем лидера
    if (leader) {
      await this.redis.hset(`${bidKey}:leader`, leader);
      this.logger.log(
        `🏆 Новый лидер: ${leader.userName} с ${leader.bidCount} ставками`,
      );
    } else {
      await this.redis.del(`${bidKey}:leader`);
      this.logger.log(`❌ Лидер не найден, данные очищены`);
    }
    await this.redis.expire(`${bidKey}:leader`, this.BID_EXPIRY);
  }

  // Получение информации о ставках лота
  async getLotBids(lotId: string): Promise<LotBids> {
    const title = await this.getLotTitle(lotId);
    this.logger.log(`📊 Получение данных лота [${title}] ${lotId}`);

    const bidKey = `lot:${lotId}:bids`;

    try {
      // Получаем общее количество ставок
      const totalBids = parseInt(
        (await this.redis.get(`${bidKey}:total`)) || '0',
      );

      // Получаем лидера
      const leaderData = await this.redis.hgetall(`${bidKey}:leader`);
      const currentLeader =
        leaderData.userId && leaderData.userName
          ? {
              userId: leaderData.userId,
              userName: leaderData.userName,
              bidCount: parseInt(leaderData.bidCount || '0'),
            }
          : null;

      // Получаем последние ставки
      const recentBidsData: string[] = await this.redis.lrange(
        `${bidKey}:recent`,
        0,
        19,
      ); // Последние 20 ставок
      const recentBids: BidInfo[] = recentBidsData.map((bid) => {
        const parsed = JSON.parse(bid) as BidInfo;
        return parsed;
      });

      this.logger.log(
        `📈 Данные лота [${title}] ${lotId}: всего ${totalBids} ставок, лидер ${currentLeader?.userName || 'нет'}, недавних ставок ${recentBids.length}`,
      );

      return {
        lotId,
        totalBids,
        currentLeader,
        recentBids,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка получения данных лота ${lotId}: ${message}`);
      throw error;
    }
  }

  // === Доп. ключи по лоту ===
  async setLastBidAt(lotId: string, timestampMs: number): Promise<void> {
    await this.redis.set(`lot:${lotId}:lastBidAt`, timestampMs.toString());
  }

  async getLastBidAt(lotId: string): Promise<number> {
    const value = await this.redis.get(`lot:${lotId}:lastBidAt`);
    return parseInt(value || '0');
  }

  async incrementRealSpent(
    lotId: string,
    amountKopeks: number,
  ): Promise<number> {
    const newValue = await this.redis.incrby(
      `lot:${lotId}:realSpent`,
      amountKopeks,
    );
    return newValue;
  }

  async getRealSpent(lotId: string): Promise<number> {
    const value = await this.redis.get(`lot:${lotId}:realSpent`);
    return parseInt(value || '0');
  }

  // Признак бота теперь определяется по роли в БД, Redis-сет не используется

  // Простой распределённый лок
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // Получение ставок пользователя на конкретный лот
  async getUserBids(lotId: string, userId: string): Promise<number> {
    const title = await this.getLotTitle(lotId);
    const userKey = `lot:${lotId}:user:${userId}`;
    const userData = await this.redis.hgetall(userKey);
    const bidCount = parseInt(userData.bidCount || '0');

    this.logger.log(
      `👤 Ставки пользователя ${userId} на лоте [${title}] ${lotId}: ${bidCount}`,
    );

    return bidCount;
  }

  // Получение всех активных лотов с информацией о ставках
  async getAllActiveLots(): Promise<LotBids[]> {
    this.logger.log('🔍 Поиск всех активных лотов');

    const lotKeys = await this.redis.keys('lot:*:total');
    const lotIds = lotKeys.map((key) => key.split(':')[1]);

    this.logger.log(`📋 Найдено ${lotIds.length} активных лотов`);

    const lots: LotBids[] = [];
    for (const lotId of lotIds) {
      const lotBids = await this.getLotBids(lotId);
      lots.push(lotBids);
    }

    return lots;
  }

  // Очистка данных лота (при завершении розыгрыша)
  async clearLotData(lotId: string): Promise<void> {
    const title = await this.getLotTitle(lotId);
    this.logger.log(`🧹 Очистка данных лота [${title}] ${lotId}`);

    const keys = await this.redis.keys(`lot:${lotId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(`✅ Удалено ${keys.length} ключей для лота ${lotId}`);
    } else {
      this.logger.log(`ℹ️ Данные лота ${lotId} уже очищены`);
    }
  }

  // Получение топ-10 пользователей по ставкам на лот
  async getTopBidders(lotId: string, limit: number = 10): Promise<BidInfo[]> {
    const title = await this.getLotTitle(lotId);
    this.logger.log(
      `🏆 Получение топ-${limit} пользователей для лота [${title}] ${lotId}`,
    );

    const userKeys = await this.redis.keys(`lot:${lotId}:user:*`);
    const users: BidInfo[] = [];

    for (const userKey of userKeys) {
      const userData = await this.redis.hgetall(userKey);
      if (userData.userId && userData.bidCount && userData.userName) {
        users.push({
          userId: userData.userId,
          userName: userData.userName,
          bidCount: parseInt(userData.bidCount),
          timestamp: parseInt(userData.timestamp || '0'),
        });
      }
    }

    // Сортируем по количеству ставок (убывание)
    const sortedUsers = users
      .toSorted((a, b) => b.bidCount - a.bidCount)
      .slice(0, limit);

    this.logger.log(
      `📊 Топ-${sortedUsers.length} пользователей для лота [${title}] ${lotId}:`,
    );
    sortedUsers.forEach((user, index) => {
      this.logger.log(
        `  ${index + 1}. ${user.userName}: ${user.bidCount} ставок`,
      );
    });

    return sortedUsers;
  }

  private async getLotTitle(lotId: string): Promise<string> {
    try {
      const lot = await this.prisma.lot.findUnique({
        where: { id: lotId },
        select: { title: true },
      });
      return lot?.title ?? '';
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Не удалось получить title лота ${lotId}: ${message}`);
      return '';
    }
  }

  // === Автоставки ===
  private getAutoLotKey(lotId: string): string {
    return `autobid:lot:${lotId}`;
  }

  private getAutoUserKey(userId: string): string {
    return `autobid:user:${userId}`;
  }

  private getAutoBidLimitKey(userId: string, lotId: string): string {
    return `autobid:limit:${userId}:${lotId}`;
  }

  async enableAutoBid(
    userId: string,
    lotId: string,
    maxBids: number,
  ): Promise<void> {
    const lotKey = this.getAutoLotKey(lotId);
    const userKey = this.getAutoUserKey(userId);
    const limitKey = this.getAutoBidLimitKey(userId, lotId);

    // Сохраняем лимит ставок для пользователя на конкретном лоте
    await this.redis.set(limitKey, maxBids.toString());

    await this.redis
      .pipeline()
      .sadd(lotKey, userId)
      .sadd(userKey, lotId)
      .exec();

    // Добавляем пользователя в очередь автоставок (в конец очереди)
    await this.addToAutoBidQueue(lotId, userId);

    this.logger.log(
      `⚙️ Автоставка включена: user=${userId}, lot=${lotId}, лимит=${maxBids} ставок, добавлен в очередь`,
    );
  }

  async disableAutoBid(userId: string, lotId: string): Promise<void> {
    const lotKey = this.getAutoLotKey(lotId);
    const userKey = this.getAutoUserKey(userId);
    const limitKey = this.getAutoBidLimitKey(userId, lotId);

    await this.redis
      .pipeline()
      .srem(lotKey, userId)
      .srem(userKey, lotId)
      .del(limitKey)
      .exec();

    // Удаляем пользователя из очереди автоставок
    await this.removeFromAutoBidQueue(lotId, userId);

    this.logger.log(
      `🛑 Автоставка выключена: user=${userId}, lot=${lotId}, удален из очереди`,
    );
  }

  async getAutoBidders(lotId: string): Promise<string[]> {
    const lotKey = this.getAutoLotKey(lotId);
    const members = await this.redis.smembers(lotKey);
    return members;
  }

  async getUserAutoBids(userId: string): Promise<string[]> {
    const userKey = this.getAutoUserKey(userId);
    const lots = await this.redis.smembers(userKey);
    return lots;
  }

  // Получение лимита ставок для пользователя на конкретном лоте
  async getAutoBidLimit(userId: string, lotId: string): Promise<number | null> {
    const limitKey = this.getAutoBidLimitKey(userId, lotId);
    const limit = await this.redis.get(limitKey);
    return limit ? parseInt(limit) : null;
  }

  // Проверка лимита ставок для конкретного пользователя и отключение автоставки при достижении
  async checkUserBidLimitAndDisableAutoBid(
    userId: string,
    lotId: string,
  ): Promise<boolean> {
    try {
      const limitKey = this.getAutoBidLimitKey(userId, lotId);
      const maxBids = await this.redis.get(limitKey);

      if (!maxBids) {
        return false; // Лимит не установлен
      }

      const maxBidsNumber = parseInt(maxBids);
      const userBids = await this.getUserBids(lotId, userId);

      if (userBids >= maxBidsNumber) {
        this.logger.log(
          `🚫 Пользователь ${userId} достиг лимита ставок (${maxBidsNumber}) на лоте ${lotId}. Отключаем автоставку.`,
        );

        // Отключаем автоставку для этого пользователя на этом лоте
        await this.disableAutoBid(userId, lotId);

        return true; // Лимит достигнут, автоставка отключена
      }

      return false; // Лимит не достигнут
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Ошибка при проверке лимита ставок для пользователя ${userId} на лоте ${lotId}: ${message}`,
      );
      return false;
    }
  }

  async disableAllAutoBidsForUser(userId: string): Promise<void> {
    const userKey = this.getAutoUserKey(userId);
    const lots = await this.redis.smembers(userKey);
    if (lots.length === 0) return;

    const pipe = this.redis.pipeline();
    for (const lotId of lots) {
      const limitKey = this.getAutoBidLimitKey(userId, lotId);
      pipe.srem(this.getAutoLotKey(lotId), userId);
      pipe.del(limitKey);
      // Удаляем пользователя из очереди автоставок для каждого лота
      pipe.lrem(this.getAutoBidQueueKey(lotId), 0, userId);
    }
    pipe.del(userKey);
    await pipe.exec();
    this.logger.log(
      `🛑 Автоставки отключены для пользователя ${userId} во всех лотах (${lots.length}), удален из всех очередей`,
    );
  }

  // Отключение автоставок у всех пользователей на конкретном лоте
  async disableAllAutoBidsForLot(lotId: string): Promise<void> {
    const lotKey = this.getAutoLotKey(lotId);
    const userIds = await this.redis.smembers(lotKey);
    if (userIds.length === 0) return;

    const pipe = this.redis.pipeline();
    for (const userId of userIds) {
      const limitKey = this.getAutoBidLimitKey(userId, lotId);
      pipe.srem(this.getAutoUserKey(userId), lotId);
      pipe.del(limitKey);
    }
    pipe.del(lotKey);
    // Очищаем очередь автоставок для лота
    pipe.del(this.getAutoBidQueueKey(lotId));
    await pipe.exec();
    this.logger.log(
      `🧹 Автоставки очищены для лота ${lotId} (пользователей: ${userIds.length})`,
    );
  }

  // ========== МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ ОЧЕРЕДЬЮ АВТОСТАВОК ==========

  private getAutoBidQueueKey(lotId: string): string {
    return `autobid:queue:${lotId}`;
  }

  // Добавление пользователя в очередь автоставок (в конец очереди)
  async addToAutoBidQueue(lotId: string, userId: string): Promise<void> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    await this.redis.rpush(queueKey, userId);
    this.logger.log(
      `📋 Пользователь ${userId} добавлен в очередь автоставок лота ${lotId}`,
    );
  }

  // Получение следующего пользователя из очереди автоставок
  async getNextFromAutoBidQueue(lotId: string): Promise<string | null> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    const userId = await this.redis.lpop(queueKey);
    return userId;
  }

  // Перемещение пользователя в конец очереди (после автоставки)
  async moveToEndOfAutoBidQueue(lotId: string, userId: string): Promise<void> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    await this.redis.rpush(queueKey, userId);
    this.logger.log(
      `🔄 Пользователь ${userId} перемещен в конец очереди автоставок лота ${lotId}`,
    );
  }

  // Получение текущей очереди автоставок
  async getAutoBidQueue(lotId: string): Promise<string[]> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    return await this.redis.lrange(queueKey, 0, -1);
  }

  // Проверка, находится ли пользователь в очереди автоставок
  async isInAutoBidQueue(lotId: string, userId: string): Promise<boolean> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    const queue = await this.redis.lrange(queueKey, 0, -1);
    return queue.includes(userId);
  }

  // Удаление пользователя из очереди автоставок
  async removeFromAutoBidQueue(lotId: string, userId: string): Promise<void> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    await this.redis.lrem(queueKey, 0, userId);
    this.logger.log(
      `❌ Пользователь ${userId} удален из очереди автоставок лота ${lotId}`,
    );
  }

  // Очистка очереди автоставок для лота
  async clearAutoBidQueue(lotId: string): Promise<void> {
    const queueKey = this.getAutoBidQueueKey(lotId);
    await this.redis.del(queueKey);
    this.logger.log(`🧹 Очередь автоставок очищена для лота ${lotId}`);
  }

  // Проверка, находится ли лот в критическом времени (1-3 секунды до окончания по неактивности)
  async isInCriticalTime(lotId: string): Promise<boolean> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { inactivityTimeoutMs: true },
    });

    if (!lot) return false;

    const lastBidAt = await this.getLastBidAt(lotId);
    if (!lastBidAt) return false; // если нет ставок, не в критическом времени

    const now = Date.now();
    const timeoutMs = lot.inactivityTimeoutMs ?? 10000; // 10 секунд по умолчанию
    const timeSinceLastBid = now - lastBidAt;
    const timeUntilTimeout = timeoutMs - timeSinceLastBid;

    // Проверяем, что до таймаута по неактивности остается от 1 до 3 секунд
    return timeUntilTimeout <= 3000 && timeUntilTimeout >= 1000;
  }

  // Получение времени до окончания розыгрыша в миллисекундах (по неактивности)
  async getTimeUntilEnd(lotId: string): Promise<number> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { inactivityTimeoutMs: true },
    });

    if (!lot) return 0;

    const lastBidAt = await this.getLastBidAt(lotId);
    if (!lastBidAt) return 0; // если нет ставок, время до окончания = 0

    const now = Date.now();
    const timeoutMs = lot.inactivityTimeoutMs ?? 10000; // 10 секунд по умолчанию
    const timeSinceLastBid = now - lastBidAt;
    const timeUntilTimeout = timeoutMs - timeSinceLastBid;

    return Math.max(0, timeUntilTimeout);
  }

  // Получение количества пользователей с активными автоставками на лоте
  async getAutoBiddersCount(lotId: string): Promise<number> {
    const lotKey = this.getAutoLotKey(lotId);
    const count = await this.redis.scard(lotKey);
    return count;
  }

  // Проверка, является ли пользователь текущим лидером лота (по последней ставке)
  async isUserCurrentLeader(lotId: string, userId: string): Promise<boolean> {
    const bidKey = `lot:${lotId}:bids`;

    // Получаем последнюю ставку из списка недавних ставок
    const recentBidsData: string[] = await this.redis.lrange(
      `${bidKey}:recent`,
      0,
      0, // Берем только самую последнюю ставку
    );

    if (recentBidsData.length === 0) {
      return false; // Нет ставок
    }

    const lastBid = JSON.parse(recentBidsData[0]) as BidInfo;
    return lastBid.userId === userId;
  }
}
