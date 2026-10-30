import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService, LotBids } from './redis.service';
import { BidsService } from '../bids/bids.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { UserWithoutPassword } from '../common/types/user.types';

@Injectable()
export class BiddingService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private bidsService: BidsService,
  ) {}

  async placeBid(
    userId: string,
    placeBidDto: PlaceBidDto,
  ): Promise<{
    user: UserWithoutPassword;
    lotBids: LotBids;
    message: string;
  }> {
    const { lotId, bidCount } = placeBidDto;

    // Проверяем существование лота
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    if (!lot.isActive) {
      throw new BadRequestException('Лот неактивен');
    }

    // Логику окончания по currentEnd отключаем — розыгрыш завершается по неактивности (см. scheduler)

    // Получаем информацию о пользователе
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Проверяем, что у пользователя есть ставки (списываем 1 ставку)
    const currentBids = user.bids || 0;
    if (currentBids < 1) {
      throw new BadRequestException(
        `Недостаточно ставок. Доступно: ${currentBids}, требуется: 1`,
      );
    }

    // Выполняем ставку в транзакции
    const result = await this.prisma.$transaction(async (tx) => {
      // Блокируем строку лота и повторно проверяем активность внутри транзакции.
      // Это не позволяет ставке пройти одновременно с закрытием лота.
      const activeLot = await tx.lot.updateMany({
        where: { id: lotId, isActive: true, isFinished: false },
        data: { isActive: true },
      });
      if (activeLot.count !== 1) {
        throw new BadRequestException('Торги по этому лоту завершены');
      }

      // Списываем 1 ставку
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          bids: Math.max(0, (user.bids || 0) - 1),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          balance: true,
          bids: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Добавляем ставку в Redis (количество ставок на лот остается bidCount)
      await tx.bidHistory.create({
        data: { userId, lotId, bidCount },
      });

      const lotBids = await this.redisService.addBid(
        lotId,
        userId,
        user.name,
        bidCount,
      );

      return { updatedUser, lotBids };
    });

    // Учитываем реальные траты
    const { bidPrice } = this.bidsService.getBidPrice();
    await this.redisService.incrementRealSpent(lotId, bidPrice);

    // Broadcasting выполняется на уровне WebSocket gateway (для реальных
    // пользователей) или инициатором (бот-сервис/планировщик) для ботов.

    // Если у пользователя закончились ставки — отключаем все его автоставки
    if ((result.updatedUser.bids || 0) <= 0) {
      await this.redisService.disableAllAutoBidsForUser(userId);
    }

    // Проверяем лимит ставок для автоставок пользователя на этом лоте
    await this.redisService.checkUserBidLimitAndDisableAutoBid(userId, lotId);

    return {
      user: result.updatedUser,
      lotBids: result.lotBids,
      message: `Успешно размещено ${bidCount} ставок на лот "${lot.title}"`,
    };
  }

  // Ставка от бота: не обращаемся к таблице User, не списываем ставки, но учитываем в Redis
  async placeBotBid(
    botId: string,
    botName: string,
    placeBidDto: PlaceBidDto,
  ): Promise<{ lotBids: LotBids; message: string }> {
    const { lotId, bidCount } = placeBidDto;

    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }
    if (!lot.isActive) {
      throw new BadRequestException('Лот неактивен');
    }

    const lotBids = await this.redisService.addBid(lotId, botId, botName, bidCount);
    return {
      lotBids,
      message: `Бот ${botName} разместил ${bidCount} ставок на лот "${lot.title}"`,
    };
  }

  // Получение информации о ставках лота
  async getLotBids(lotId: string): Promise<LotBids> {
    // Проверяем существование лота
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    return this.redisService.getLotBids(lotId);
  }

  // Получение ставок пользователя на конкретный лот
  async getUserBidsOnLot(
    lotId: string,
    userId: string,
  ): Promise<{
    lotId: string;
    userBids: number;
    totalBids: number;
    userRank: number;
  }> {
    // Проверяем существование лота
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    const userBids = await this.redisService.getUserBids(lotId, userId);
    const topBidders = await this.redisService.getTopBidders(lotId);
    const lotBids = await this.redisService.getLotBids(lotId);

    // Определяем ранг пользователя
    const userRank = topBidders.findIndex((bid) => bid.userId === userId) + 1;
    if (userRank === 0 && userBids > 0) {
      // Если пользователь не в топе, но имеет ставки
      const allBidders = await this.redisService.getTopBidders(lotId, 1000);
      const userRank = allBidders.findIndex((bid) => bid.userId === userId) + 1;
    }

    return {
      lotId,
      userBids,
      totalBids: lotBids.totalBids,
      userRank: userRank || 0,
    };
  }

  // Получение топ-10 пользователей по ставкам на лот
  async getTopBidders(
    lotId: string,
    limit: number = 10,
  ): Promise<{
    lotId: string;
    topBidders: Array<{
      userId: string;
      userName: string;
      bidCount: number;
      timestamp: number;
    }>;
  }> {
    // Проверяем существование лота
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    const topBidders = await this.redisService.getTopBidders(lotId, limit);

    return {
      lotId,
      topBidders,
    };
  }

  // Получение всех активных лотов с информацией о ставках
  async getAllActiveLotsWithBids(): Promise<LotBids[]> {
    return this.redisService.getAllActiveLots();
  }

  // Очистка данных лота (при завершении розыгрыша)
  async clearLotData(lotId: string): Promise<void> {
    await this.redisService.clearLotData(lotId);
  }
}
