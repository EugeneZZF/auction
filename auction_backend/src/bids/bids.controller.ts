import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { BidsService } from './bids.service';
import { BuyBidsDto } from './dto/buy-bids.dto';
import { Auth, CurrentUser } from '../auth/decorators';
import { User } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Bids')
@Controller('bids')
@Auth()
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @ApiOperation({
    summary: 'Покупка ставок',
    description: 'Покупка указанного количества ставок за счет баланса пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Ставки успешно куплены',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Ставки успешно куплены' },
        quantity: { type: 'number', example: 10 },
        totalCost: { type: 'number', example: 1000 },
        newBalance: { type: 'number', example: 9000 },
        newBidCount: { type: 'number', example: 110 },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Недостаточно средств или неверное количество ставок',
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: BuyBidsDto })
  @Post('buy')
  buyBids(@CurrentUser() user: User, @Body() buyBidsDto: BuyBidsDto) {
    return this.bidsService.buyBids(user.id, buyBidsDto);
  }

  @ApiOperation({
    summary: 'Получение информации о пользователе',
    description: 'Получение информации о балансе и количестве ставок пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о пользователе',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: 'uuid' },
        balance: { type: 'number', example: 10000, description: 'Баланс в копейках' },
        bids: { type: 'number', example: 50, description: 'Количество ставок' },
        bidPrice: { type: 'number', example: 100, description: 'Цена одной ставки в копейках' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiBearerAuth('JWT-auth')
  @Get('user-info')
  getUserInfo(@CurrentUser() user: User) {
    return this.bidsService.getUserInfo(user.id);
  }

  @ApiOperation({
    summary: 'Получение цены ставки',
    description: 'Получение текущей цены одной ставки',
  })
  @ApiResponse({
    status: 200,
    description: 'Цена одной ставки',
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', example: 100, description: 'Цена одной ставки в копейках' },
        currency: { type: 'string', example: 'копеек' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiBearerAuth('JWT-auth')
  @Get('price')
  getBidPrice() {
    return this.bidsService.getBidPrice();
  }

  @ApiOperation({
    summary: 'Расчет стоимости покупки',
    description: 'Расчет общей стоимости покупки указанного количества ставок',
  })
  @ApiResponse({
    status: 200,
    description: 'Стоимость покупки',
    schema: {
      type: 'object',
      properties: {
        quantity: { type: 'number', example: 10 },
        pricePerBid: { type: 'number', example: 100 },
        totalCost: { type: 'number', example: 1000 },
        currency: { type: 'string', example: 'копеек' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Неверное количество ставок',
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'quantity',
    description: 'Количество ставок для расчета',
    example: 10,
    type: Number,
  })
  @Get('calculate/:quantity')
  calculatePurchaseCost(@Param('quantity', ParseIntPipe) quantity: number) {
    return this.bidsService.calculatePurchaseCost(quantity);
  }

  @ApiOperation({
    summary: 'Проверка возможности покупки',
    description: 'Проверка возможности покупки указанного количества ставок с учетом текущего баланса',
  })
  @ApiResponse({
    status: 200,
    description: 'Результат проверки возможности покупки',
    schema: {
      type: 'object',
      properties: {
        canBuy: { type: 'boolean', example: true },
        quantity: { type: 'number', example: 10 },
        totalCost: { type: 'number', example: 1000 },
        currentBalance: { type: 'number', example: 10000 },
        remainingBalance: { type: 'number', example: 9000 },
        message: { type: 'string', example: 'Покупка возможна' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Неверное количество ставок',
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'quantity',
    description: 'Количество ставок для проверки',
    example: 10,
    type: Number,
  })
  @Get('check/:quantity')
  checkPurchasePossibility(
    @CurrentUser() user: User,
    @Param('quantity', ParseIntPipe) quantity: number,
  ) {
    return this.bidsService.checkPurchasePossibility(user.id, quantity);
  }
}
