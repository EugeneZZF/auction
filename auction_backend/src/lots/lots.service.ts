import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../bidding/redis.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { Lot } from '@prisma/client';

@Injectable()
export class LotsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  // Отключаем автопродление по таймеру: закрытие/перезапуск теперь управляется неактивностью (см. AuctionSchedulerService)
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    return; // no-op
  }

  // Создание нового лота
  async create(createLotDto: CreateLotDto): Promise<Lot> {
    const denomination = this.getDenomination(createLotDto.basePrice);
    const now = new Date();
    const currentEnd = new Date(
      now.getTime() + createLotDto.periodSeconds * 1000,
    );

    const lot = await this.prisma.lot.create({
      data: {
        title: `Банкнота ${denomination} ₽`,
        description: createLotDto.description,
        image: `/${denomination}.svg`,
        basePrice: createLotDto.basePrice,
        periodSeconds: createLotDto.periodSeconds,
        currentStart: now,
        currentEnd: currentEnd,
        isActive: createLotDto.isActive ?? true,
        inactivityTimeoutMs:
          createLotDto.inactivityTimeoutMs ?? 10_000,
      },
    });

    // Инициализируем таймер неактивности от момента создания
    await this.redis.setLastBidAt(lot.id, Date.now());

    return lot;
  }

  // Получение всех лотов с вычисленным временем по системе неактивности
  async findAll(): Promise<(Lot & { inactivityEndsAt: Date | null })[]> {
    const lots = await this.prisma.lot.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return this.attachSystemTime(lots);
  }

  // Получение активных лотов
  async findActive(): Promise<(Lot & { inactivityEndsAt: Date | null })[]> {
    const lots = await this.prisma.lot.findMany({
      where: { isActive: true, isFinished: false },
      orderBy: { createdAt: 'desc' },
    });
    return this.attachSystemTime(lots);
  }

  // Получение лота по ID
  async findOne(id: string): Promise<Lot & { inactivityEndsAt: Date | null }> {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      include: {
        wins: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { wonAt: 'desc' },
        },
      },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    const [withTime] = await this.attachSystemTime([lot]);
    return withTime;
  }

  // Обновление лота
  async update(id: string, updateLotDto: UpdateLotDto): Promise<Lot> {
    // Проверяем, существует ли лот
    const existingLot = await this.prisma.lot.findUnique({
      where: { id },
    });

    if (!existingLot) {
      throw new NotFoundException('Лот не найден');
    }

    // Если обновляется период, пересчитываем время окончания
    if (existingLot.isFinished) {
      throw new BadRequestException('Finished lots cannot be changed');
    }
    let updateData: any = {};

    // Добавляем только те поля, которые переданы в DTO
    if (updateLotDto.description !== undefined)
      updateData.description = updateLotDto.description;
    if (updateLotDto.basePrice !== undefined) {
      const denomination = this.getDenomination(updateLotDto.basePrice);
      updateData.basePrice = updateLotDto.basePrice;
      updateData.title = `Банкнота ${denomination} ₽`;
      updateData.image = `/${denomination}.svg`;
    }
    if (updateLotDto.isActive !== undefined)
      updateData.isActive = updateLotDto.isActive;
    if (updateLotDto.inactivityTimeoutMs !== undefined)
      updateData.inactivityTimeoutMs = updateLotDto.inactivityTimeoutMs;

    // Если обновляется период, пересчитываем время окончания
    if (updateLotDto.periodSeconds) {
      const now = new Date();
      const currentEnd = new Date(
        now.getTime() + updateLotDto.periodSeconds * 1000,
      );
      updateData.periodSeconds = updateLotDto.periodSeconds;
      updateData.currentStart = now;
      updateData.currentEnd = currentEnd;
    }

    return this.prisma.lot.update({
      where: { id },
      data: updateData,
    });
  }

  // Удаление лота
  async remove(id: string): Promise<{ message: string }> {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    if (lot.isFinished) {
      throw new BadRequestException('Finished lots cannot be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.wins.deleteMany({ where: { lotId: id } });
      await tx.lot.delete({ where: { id } });
    });

    return { message: 'Лот успешно удален' };
  }

  // Автопродление больше не используется
  async updateExpiredLots(): Promise<void> {
    return; // no-op
  }

  // Получение лотов с автоматическим обновлением времени
  async findAllWithAutoUpdate(): Promise<Lot[]> {
    return this.findAll();
  }

  // Получение активных лотов с автоматическим обновлением времени
  async findActiveWithAutoUpdate(): Promise<Lot[]> {
    return this.findActive();
  }

  // Получение лота по ID с автоматическим обновлением времени
  async findOneWithAutoUpdate(id: string): Promise<Lot> {
    return this.findOne(id);
  }

  // Подмешивает вычисляемое время окончания по правилам неактивности: lastBidAt + 10s (или null, если ставок ещё не было)
  private async attachSystemTime<T extends Lot>(
    lots: T[],
  ): Promise<(T & { inactivityEndsAt: Date | null })[]> {
    const result: (T & { inactivityEndsAt: Date | null })[] = [];
    for (const lot of lots) {
      const lastBidAt = await this.redis.getLastBidAt(lot.id);
      const endsAt = lastBidAt ? new Date(lastBidAt + 10_000) : null;
      result.push({ ...(lot as any), inactivityEndsAt: endsAt });
    }
    return result;
  }

  // Активация/деактивация лота
  async toggleActive(id: string): Promise<Lot> {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
    });

    if (!lot) {
      throw new NotFoundException('Лот не найден');
    }

    if (lot.isFinished) {
      throw new BadRequestException('This lot is already finished');
    }

    return this.prisma.lot.update({
      where: { id },
      data: { isActive: !lot.isActive },
    });
  }

  async setBotsEnabled(id: string, enabled: boolean): Promise<Lot> {
    const lot = await this.prisma.lot.findUnique({ where: { id } });
    if (!lot) throw new NotFoundException('Лот не найден');
    if (lot.isFinished) {
      throw new BadRequestException('Finished lots cannot be changed');
    }

    return this.prisma.lot.update({
      where: { id },
      data: { botsEnabled: enabled },
    });
  }

  private getDenomination(basePriceKopeks: number): number {
    const denominations: Record<number, number> = {
      50_000: 500,
      100_000: 1000,
      200_000: 2000,
      500_000: 5000,
    };
    const denomination = denominations[basePriceKopeks];
    if (!denomination) {
      throw new BadRequestException(
        'Для лота доступны номиналы 500, 1000, 2000 и 5000 рублей',
      );
    }
    return denomination;
  }
}
