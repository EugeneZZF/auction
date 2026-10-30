import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma.service';
import { RedisService } from './redis.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/public',
})
export class TimersGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TimersGateway.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // Подключение к публичному неймспейсу (без JWT)
  async handleConnection(client: Socket) {
    this.logger.log(`🔓 Публичное подключение: ${client.id}`);
  }

  // Подписка на таймер конкретного лота (без JWT)
  @SubscribeMessage('subscribeLotTimer')
  async handleSubscribeLotTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lotId: string },
  ) {
    const { lotId } = data;
    await client.join(`public:lot:${lotId}`);
    const payload = await this.buildTimerPayload(lotId);
    client.emit('lotTimerUpdate', payload);
    return { success: true, lotId };
  }

  @SubscribeMessage('unsubscribeLotTimer')
  async handleUnsubscribeLotTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lotId: string },
  ) {
    const { lotId } = data;
    await client.leave(`public:lot:${lotId}`);
    return { success: true, lotId };
  }

  // Публичная ручка: вернуть время до окончания для всех лотов
  @SubscribeMessage('getLotsTimers')
  async handleGetLotsTimers(
    @ConnectedSocket() _client: Socket,
    @MessageBody()
    data?: {
      includeInactive?: boolean;
    },
  ) {
    const includeInactive = data?.includeInactive ?? false;

    const lots = await this.prisma.lot.findMany({
      where: includeInactive ? {} : { isActive: true, isFinished: false },
      select: {
        id: true,
        title: true,
        isActive: true,
        inactivityTimeoutMs: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const timers: Array<{
      lotId: string;
      title: string;
      isActive: boolean;
      inactivityEndsAt: number | null;
      msLeft: number | null;
    }> = [];

    for (const lot of lots) {
      const lastBidAt = await this.redis.getLastBidAt(lot.id);
      const endsAt = lastBidAt
        ? lastBidAt + (lot.inactivityTimeoutMs ?? 10_000)
        : null;
      const msLeft = endsAt ? Math.max(0, endsAt - now) : null;
      timers.push({
        lotId: lot.id,
        title: lot.title,
        isActive: lot.isActive,
        inactivityEndsAt: endsAt,
        msLeft,
      });
    }

    this.logger.log(
      `⏲️ getLotsTimers → ${timers.length} лотов (includeInactive=${includeInactive})`,
    );

    return { timers };
  }

  // Публичная рассылка обновления таймера для конкретного лота
  async broadcastTimerUpdate(lotId: string): Promise<void> {
    const payload = await this.buildTimerPayload(lotId);
    this.server.to(`public:lot:${lotId}`).emit('lotTimerUpdate', payload);
    this.server.emit('lotTimerUpdate', payload);
  }

  private async buildTimerPayload(lotId: string): Promise<{
    lotId: string;
    title: string;
    inactivityEndsAt: number | null;
    msLeft: number | null;
  }> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { title: true, inactivityTimeoutMs: true },
    });
    const title = lot?.title ?? '';
    const now = Date.now();
    const lastBidAt = await this.redis.getLastBidAt(lotId);
    const endsAt = lastBidAt
      ? lastBidAt + (lot?.inactivityTimeoutMs ?? 10_000)
      : null;
    const msLeft = endsAt ? Math.max(0, endsAt - now) : null;
    return { lotId, title, inactivityEndsAt: endsAt, msLeft };
  }
}

// Duplicate block removed

