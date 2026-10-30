import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { BiddingService } from './bidding.service';
import { RedisService, LotBids, BidInfo } from './redis.service';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { PrismaService } from '../prisma.service';
import { TimersGateway } from './timers.gateway';
import { UserWithoutPassword } from '../common/types/user.types';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseGuards(WsJwtGuard)
export class BiddingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BiddingGateway.name);
  private readonly connectedUsers = new Map<string, AuthenticatedSocket>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly biddingService: BiddingService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly timersGateway: TimersGateway,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`🔌 Новое подключение: ${client.id}`);

    try {
      // Получаем токен из handshake auth
      let token: string | undefined;
      if (typeof client.handshake.auth?.token === 'string') {
        token = client.handshake.auth.token;
      } else if (typeof client.handshake.headers?.authorization === 'string') {
        token = client.handshake.headers.authorization.replace('Bearer ', '');
      } else {
        token = undefined;
      }

      this.logger.log(`🔑 Токен получен: ${token ? 'Да' : 'Нет'}`);

      if (!token) {
        this.logger.warn(`❌ Токен не предоставлен для клиента ${client.id}`);

        // Отправляем ошибку клиенту перед отключением
        client.emit('error', {
          type: 'authentication_error',
          message: 'Токен не предоставлен',
          code: 'NO_TOKEN',
        });

        // Небольшая задержка, чтобы клиент успел получить ошибку
        setTimeout(() => {
          client.disconnect();
        }, 100);
        return;
      }

      // Верифицируем JWT токен
      interface JwtPayload {
        id: string;
      }
      const payload = this.jwtService.verify<JwtPayload>(token);
      client.userId = payload.id;

      this.logger.log(`✅ JWT верифицирован для пользователя: ${payload.id}`);

      // Получаем информацию о пользователе
      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
        select: { name: true },
      });

      if (user) {
        client.userName = user.name;
        this.connectedUsers.set(payload.id, client);

        // Подключаем пользователя к персональной комнате для получения обновлений баланса
        await client.join(`user:${payload.id}`);

        this.logger.log(
          `👤 Пользователь ${user.name} (${payload.id}) подключился к WebSocket`,
        );
        this.logger.log(
          `📊 Всего подключенных пользователей: ${this.connectedUsers.size}`,
        );
      } else {
        this.logger.warn(`⚠️ Пользователь не найден в БД: ${payload.id}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Ошибка аутентификации WebSocket для клиента ${client.id}: ${message}`,
      );

      // Отправляем ошибку клиенту перед отключением
      client.emit('error', {
        type: 'authentication_error',
        message: message,
        code:
          message === 'jwt expired' ? 'TOKEN_EXPIRED' : 'AUTHENTICATION_FAILED',
      });

      // Небольшая задержка, чтобы клиент успел получить ошибку
      setTimeout(() => {
        client.disconnect();
      }, 100);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.connectedUsers.delete(client.userId);
      this.logger.log(
        `👋 Пользователь ${client.userName} (${client.userId}) отключился от WebSocket`,
      );
      this.logger.log(
        `📊 Осталось подключенных пользователей: ${this.connectedUsers.size}`,
      );
    } else {
      this.logger.log(
        `🔌 Неаутентифицированный клиент ${client.id} отключился`,
      );
    }
  }

  // Подписка на обновления конкретного лота
  @SubscribeMessage('subscribeToLot')
  async handleSubscribeToLot(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string },
  ) {
    this.logger.log(
      `📡 subscribeToLot: ${client.userName} (${client.userId}) -> лот ${data.lotId}`,
    );

    if (!client.userId) {
      this.logger.warn(`❌ Попытка подписки без авторизации: ${client.id}`);
      return { error: 'Не авторизован' };
    }

    const { lotId } = data;

    // Присоединяем клиента к комнате лота
    await client.join(`lot:${lotId}`);
    this.logger.log(
      `🏠 Пользователь ${client.userName} присоединился к комнате lot:${lotId}`,
    );

    // Отправляем текущую информацию о ставках
    try {
      const lotBids = await this.biddingService.getLotBids(lotId);
      const userBids = await this.biddingService.getUserBidsOnLot(
        lotId,
        client.userId,
      );

      this.logger.log(
        `📊 Данные лота ${lotId}: всего ставок ${lotBids.totalBids}, пользовательских ${userBids.userBids}`,
      );

      client.emit('lotBidsUpdate', {
        lotId,
        lotBids,
        userBids,
      });

      this.logger.log(`✅ Данные отправлены пользователю ${client.userName}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка получения данных лота ${lotId}: ${message}`);
      client.emit('error', { message: 'Ошибка получения данных лота' });
    }

    return { success: true, lotId };
  }

  // Отписка от обновлений лота
  @SubscribeMessage('unsubscribeFromLot')
  async handleUnsubscribeFromLot(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string },
  ) {
    this.logger.log(
      `📡 unsubscribeFromLot: ${client.userName} (${client.userId}) -> лот ${data.lotId}`,
    );

    const { lotId } = data;
    await client.leave(`lot:${lotId}`);
    this.logger.log(
      `🏠 Пользователь ${client.userName} покинул комнату lot:${lotId}`,
    );

    return { success: true, lotId };
  }

  // Размещение ставки через WebSocket
  @SubscribeMessage('placeBid')
  async handlePlaceBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string; bidCount: number },
  ) {
    this.logger.log(
      `🎯 placeBid: ${client.userName} (${client.userId}) -> лот ${data.lotId}, ставок ${data.bidCount}`,
    );

    if (!client.userId) {
      this.logger.warn(`❌ Попытка ставки без авторизации: ${client.id}`);
      return { error: 'Не авторизован' };
    }

    try {
      const result = await this.biddingService.placeBid(client.userId, {
        lotId: data.lotId,
        bidCount: data.bidCount,
      });

      this.logger.log(
        `✅ Ставка размещена: ${client.userName} -> ${data.bidCount} ставок на лот ${data.lotId}`,
      );
      this.logger.log(`💰 Остаток ставок у пользователя: ${result.user.bids}`);

      // Единая рассылка события ставки с обновленными данными пользователя
      const normalizedUserId = client.userId ?? '';
      const normalizedUserName = client.userName ?? '';
      await this.broadcastBidPlaced(
        data.lotId,
        result.lotBids,
        {
          userId: normalizedUserId,
          userName: normalizedUserName,
          bidCount: data.bidCount,
          timestamp: Date.now(),
        },
        result.user,
      ); // передаем обновленные данные пользователя

      // Отправляем результат пользователю
      client.emit('bidResult', {
        success: true,
        user: result.user,
        message: result.message,
      });

      this.logger.log(`✅ Результат отправлен пользователю ${client.userName}`);

      return { success: true, user: result.user };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка при размещении ставки: ${message}`);

      client.emit('bidResult', {
        success: false,
        error: message,
      });

      return { error: message };
    }
  }

  // Включить автоставку на лот
  @SubscribeMessage('enableAutoBid')
  async handleEnableAutoBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string; maxBids: number },
  ) {
    if (!client.userId) return { error: 'Не авторизован' as const };
    const { lotId, maxBids } = data;
    const userId = String(client.userId);

    try {
      // Включаем автоставку с лимитом
      await this.redisService.enableAutoBid(userId, lotId, maxBids);
      this.logger.log(
        `⚙️ enableAutoBid: user=${client.userId} lot=${lotId} лимит=${maxBids}`,
      );

      // Получаем текущий статус автоставки
      const currentBids = await this.redisService.getUserBids(lotId, userId);
      const limit = await this.redisService.getAutoBidLimit(userId, lotId);
      const queue = await this.redisService.getAutoBidQueue(lotId);

      this.logger.log(
        `📋 Пользователь ${userId} включил автоставку на лоте ${lotId}. Текущая очередь: [${queue.join(', ')}]`,
      );

      client.emit('autoBidUpdated', {
        lotId,
        enabled: true,
        maxBids: limit,
        currentBids,
      });

      return { success: true, maxBids, currentBids };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка включения автоставки: ${message}`);
      client.emit('autoBidUpdated', { lotId, enabled: false, error: message });
      return { error: message };
    }
  }

  // Выключить автоставку на лот
  @SubscribeMessage('disableAutoBid')
  async handleDisableAutoBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string },
  ) {
    if (!client.userId) return { error: 'Не авторизован' as const };
    const { lotId } = data;
    const userId = String(client.userId);

    try {
      await this.redisService.disableAutoBid(userId, lotId);
      this.logger.log(`🛑 disableAutoBid: user=${client.userId} lot=${lotId}`);

      client.emit('autoBidUpdated', { lotId, enabled: false });
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка выключения автоставки: ${message}`);
      client.emit('autoBidUpdated', { lotId, enabled: false, error: message });
      return { error: message };
    }
  }

  // Получить статус автоставки на лоте
  @SubscribeMessage('getAutoBidStatus')
  async handleGetAutoBidStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string },
  ) {
    if (!client.userId) return { error: 'Не авторизован' as const };
    const { lotId } = data;
    const userId = String(client.userId);

    try {
      const currentBids = await this.redisService.getUserBids(lotId, userId);
      const limit = await this.redisService.getAutoBidLimit(userId, lotId);
      const isEnabled = limit !== null;

      client.emit('autoBidStatus', {
        lotId,
        enabled: isEnabled,
        maxBids: limit,
        currentBids,
      });

      return { enabled: isEnabled, maxBids: limit, currentBids };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка получения статуса автоставки: ${message}`);
      client.emit('error', { message: 'Ошибка получения статуса автоставки' });
      return { error: message };
    }
  }

  // Список лотов с активной автоставкой для пользователя
  @SubscribeMessage('listAutoBids')
  async handleListAutoBids(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) return { error: 'Не авторизован' as const };
    const userId = String(client.userId);
    const lots: string[] = await this.redisService.getUserAutoBids(userId);
    return { lots };
  }

  // Получение топ-10 пользователей
  @SubscribeMessage('getTopBidders')
  async handleGetTopBidders(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lotId: string; limit?: number },
  ) {
    this.logger.log(
      `📡 getTopBidders: ${client.userName} (${client.userId}) -> лот ${data.lotId}, лимит ${data.limit || 10}`,
    );

    try {
      const topBidders = await this.biddingService.getTopBidders(
        data.lotId,
        data.limit || 10,
      );
      this.logger.log(
        `🏆 Топ-${topBidders.topBidders.length} пользователей для лота ${data.lotId}`,
      );

      client.emit('topBidders', topBidders.topBidders);
      return topBidders.topBidders;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Ошибка получения топ пользователей: ${message}`);
      client.emit('error', { message: 'Ошибка получения топ-10' });
      return { error: message };
    }
  }

  // Методы для рассылки обновлений
  async broadcastBidPlaced(
    lotId: string,
    lotBids: LotBids,
    bidInfo: BidInfo,
    updatedUser?: UserWithoutPassword, // добавляем обновленные данные пользователя
  ): Promise<void> {
    this.logger.log(
      `📢 broadcastBidPlaced: ${lotId}, пользователь ${bidInfo.userName}, ставок ${bidInfo.bidCount}`,
    );

    // Отправляем обновленные данные пользователя конкретному пользователю
    if (updatedUser) {
      this.server.to(`user:${updatedUser.id}`).emit('userBalanceUpdated', {
        userId: updatedUser.id,
        balance: updatedUser.balance,
        bids: updatedUser.bids,
        timestamp: Date.now(),
      });
    }

    this.server.to(`lot:${lotId}`).emit('bidPlaced', {
      lotId,
      lotBids,
      newBid: {
        userId: bidInfo.userId,
        userName: bidInfo.userName,
        bidCount: bidInfo.bidCount,
        timestamp: bidInfo.timestamp,
      },
      // Добавляем информацию об обновленном балансе для всех участников лота
      userBalanceUpdate: updatedUser
        ? {
            userId: updatedUser.id,
            balance: updatedUser.balance,
            bids: updatedUser.bids,
          }
        : undefined,
    });
    await this.timersGateway.broadcastTimerUpdate(lotId);

    // Триггерим один раунд автоставок для любого источника (manual/auto/bot)
    try {
      // Дополнительная проверка: если автоставка включена только у одного пользователя
      // и он только что сделал ставку, отключаем автоставку
      const autoBiddersCount =
        await this.redisService.getAutoBiddersCount(lotId);
      if (autoBiddersCount === 1) {
        const isCurrentLeader = await this.redisService.isUserCurrentLeader(
          lotId,
          bidInfo.userId,
        );
        if (isCurrentLeader) {
          this.logger.log(
            `🏆 Пользователь ${bidInfo.userId} сделал ставку и стал единственным с автоставкой. Отключаем автоставку.`,
          );
          await this.redisService.disableAutoBid(bidInfo.userId, lotId);
          return;
        }
      }

      await this.processAutoBids(lotId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`⚠️ processAutoBids error for lot ${lotId}: ${message}`);
    }
  }

  async broadcastLotUpdate(lotId: string, lotBids: LotBids): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { title: true },
    });
    const title = lot?.title ?? '';
    this.logger.log(
      `📢 broadcastLotUpdate: [${title}] ${lotId}, всего ставок ${lotBids.totalBids}`,
    );
    this.server.to(`lot:${lotId}`).emit('lotBidsUpdate', {
      lotId,
      title,
      lotBids,
    });
    await this.timersGateway.broadcastTimerUpdate(lotId);
  }

  // Автоперебивание ставок на лоте - работает по очереди в последние секунды
  async processAutoBids(lotId: string): Promise<void> {
    const lockKey = `lock:lot:${lotId}:autobid`;
    const acquired = await this.redisService.acquireLock(lockKey, 5);
    if (!acquired) return; // уже обрабатывается другим инстансом

    try {
      // Проверяем, находится ли лот в критическом времени (1-3 секунды до окончания)
      const isInCriticalTime = await this.redisService.isInCriticalTime(lotId);
      if (!isInCriticalTime) {
        const timeUntilEnd = await this.redisService.getTimeUntilEnd(lotId);
        this.logger.log(
          `⏰ Лот ${lotId} не в критическом времени (${timeUntilEnd}мс до окончания), автоставки не срабатывают`,
        );
        return;
      }

      // Получаем время до окончания для логирования
      const timeUntilEnd = await this.redisService.getTimeUntilEnd(lotId);
      this.logger.log(
        `⏰ Лот ${lotId} в критическом времени: ${timeUntilEnd}мс до окончания`,
      );

      // Получаем следующего пользователя из очереди автоставок
      const nextUserId = await this.redisService.getNextFromAutoBidQueue(lotId);
      if (!nextUserId) {
        const queue = await this.redisService.getAutoBidQueue(lotId);
        this.logger.log(
          `📋 Очередь автоставок для лота ${lotId} пуста. Текущая очередь: [${queue.join(', ')}]`,
        );
        return;
      }

      // Проверяем, что пользователь все еще имеет активную автоставку
      const autoBidders = await this.redisService.getAutoBidders(lotId);
      if (!autoBidders.includes(nextUserId)) {
        this.logger.log(
          `❌ Пользователь ${nextUserId} больше не имеет активной автоставки на лоте ${lotId}`,
        );
        return;
      }

      // НОВАЯ ЛОГИКА: Проверяем, если автоставка включена только у одного пользователя
      const autoBiddersCount =
        await this.redisService.getAutoBiddersCount(lotId);
      this.logger.log(
        `🔍 Проверка автоставок для лота ${lotId}: пользователей с автоставками = ${autoBiddersCount}, следующий в очереди = ${nextUserId}`,
      );

      if (autoBiddersCount === 1) {
        // Проверяем, является ли этот пользователь уже лидером (сделал последнюю ставку)
        const isCurrentLeader = await this.redisService.isUserCurrentLeader(
          lotId,
          nextUserId,
        );
        this.logger.log(
          `🔍 Пользователь ${nextUserId} является лидером (сделал последнюю ставку): ${isCurrentLeader}`,
        );

        if (isCurrentLeader) {
          this.logger.log(
            `🏆 Пользователь ${nextUserId} уже является лидером и единственным с автоставкой. Отключаем автоставку, так как он уже выиграл.`,
          );
          await this.redisService.disableAutoBid(nextUserId, lotId);
          return;
        }
      }

      // Проверяем лимит ставок для пользователя
      const limitReached =
        await this.redisService.checkUserBidLimitAndDisableAutoBid(
          nextUserId,
          lotId,
        );

      if (limitReached) {
        this.logger.log(
          `🚫 Автоставка пользователя ${nextUserId} отключена по достижению лимита на лоте ${lotId}`,
        );
        return;
      }

      // Делаем автоставку для перебивания
      try {
        const result = await this.biddingService.placeBid(nextUserId, {
          lotId,
          bidCount: 1,
        });

        this.logger.log(
          `🤖 Автоставка по очереди: пользователь ${nextUserId} перебивает ставку на лоте ${lotId} (${timeUntilEnd}мс до окончания)`,
        );

        // Транслируем автоставку с обновленными данными пользователя
        await this.broadcastBidPlaced(
          lotId,
          result.lotBids,
          {
            userId: nextUserId,
            userName: result.user.name,
            bidCount: 1,
            timestamp: Date.now(),
          },
          result.user,
        ); // передаем обновленные данные пользователя

        // Перемещаем пользователя в конец очереди для следующего раунда
        await this.redisService.moveToEndOfAutoBidQueue(lotId, nextUserId);

        // Если у пользователя закончились ставки — отключаем автоставку
        if ((result.user.bids || 0) <= 0) {
          await this.redisService.disableAutoBid(nextUserId, lotId);
          this.logger.log(
            `🛑 Автоставка пользователя ${nextUserId} отключена - закончились ставки`,
          );
        }
      } catch (error: unknown) {
        const message: string =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `🤖 Автоставка не удалась (user=${nextUserId}, lot=${lotId}): ${message}`,
        );

        // На любые ошибки — отключаем автоставку по этому лоту
        await this.redisService.disableAutoBid(nextUserId, lotId);
      }
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  async broadcastNewBid(lotId: string, bidInfo: BidInfo): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { title: true },
    });
    const title = lot?.title ?? '';
    this.logger.log(
      `📢 broadcastNewBid: [${title}] ${lotId}, пользователь ${bidInfo.userName}, ставок ${bidInfo.bidCount}`,
    );
    this.server.to(`lot:${lotId}`).emit('newBid', {
      lotId,
      title,
      bidInfo,
    });
    await this.timersGateway.broadcastTimerUpdate(lotId);
  }

  async broadcastLotClosed(
    lotId: string,
    winner: { userId: string; userName: string; bidCount: number } | null,
  ): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { title: true },
    });
    const title = lot?.title ?? '';
    this.logger.log(
      `📢 broadcastLotClosed: [${title}] ${lotId}, победитель: ${winner?.userName ?? 'нет'}`,
    );
    this.server.to(`lot:${lotId}`).emit('lotClosed', {
      lotId,
      title,
      winner,
    });
    await this.timersGateway.broadcastTimerUpdate(lotId);
  }

  getLotSubscribersCount(lotId: string): number {
    const room = this.server.sockets.adapter.rooms.get(`lot:${lotId}`);
    const count = room ? room.size : 0;
    this.logger.log(`👥 Подписчиков лота ${lotId}: ${count}`);
    return count;
  }
}
