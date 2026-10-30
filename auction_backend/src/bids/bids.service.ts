import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BuyBidsDto } from './dto/buy-bids.dto';
import { UserWithoutPassword } from '../common/types/user.types';

@Injectable()
export class BidsService {
  private readonly BID_PRICE = 2000; // 20 рублей в копейках

  constructor(private prisma: PrismaService) {}

  // Покупка ставок
  async buyBids(
    userId: string,
    buyBidsDto: BuyBidsDto,
  ): Promise<UserWithoutPassword> {
    const { quantity } = buyBidsDto;

    // Получаем информацию о пользователе
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Рассчитываем стоимость покупки
    const totalCost = quantity * this.BID_PRICE;

    // Проверяем, достаточно ли средств на балансе
    if (user.balance < totalCost) {
      throw new BadRequestException(
        `Недостаточно средств. Необходимо: ${totalCost / 100} рублей, доступно: ${user.balance / 100} рублей`,
      );
    }

    // Выполняем покупку: списываем деньги и добавляем ставки
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: user.balance - totalCost,
        bids: (user.bids || 0) + quantity,
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

    return updatedUser;
  }

  // Получение информации о пользователе (баланс и количество ставок)
  async getUserInfo(
    userId: string,
  ): Promise<{ balance: number; bids: number; bidPrice: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        balance: true,
        bids: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return {
      balance: user.balance,
      bids: user.bids || 0,
      bidPrice: this.BID_PRICE,
    };
  }

  // Получение цены одной ставки
  getBidPrice(): { bidPrice: number; bidPriceRubles: number } {
    return {
      bidPrice: this.BID_PRICE,
      bidPriceRubles: this.BID_PRICE / 100,
    };
  }

  // Расчет стоимости покупки (без выполнения покупки)
  calculatePurchaseCost(quantity: number): {
    quantity: number;
    totalCost: number;
    totalCostRubles: number;
    bidPrice: number;
    bidPriceRubles: number;
  } {
    const totalCost = quantity * this.BID_PRICE;

    return {
      quantity,
      totalCost,
      totalCostRubles: totalCost / 100,
      bidPrice: this.BID_PRICE,
      bidPriceRubles: this.BID_PRICE / 100,
    };
  }

  // Проверка возможности покупки
  async checkPurchasePossibility(
    userId: string,
    quantity: number,
  ): Promise<{
    canPurchase: boolean;
    userBalance: number;
    requiredAmount: number;
    totalCost: number;
    totalCostRubles: number;
    message?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const totalCost = quantity * this.BID_PRICE;
    const canPurchase = user.balance >= totalCost;

    return {
      canPurchase,
      userBalance: user.balance,
      requiredAmount: totalCost,
      totalCost,
      totalCostRubles: totalCost / 100,
      message: canPurchase
        ? 'Покупка возможна'
        : `Недостаточно средств. Необходимо: ${totalCost / 100} рублей, доступно: ${user.balance / 100} рублей`,
    };
  }
}
