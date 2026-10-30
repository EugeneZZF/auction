import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { Auth, CurrentUser } from '../auth/decorators';
import { User } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Bidding')
@Controller('bidding')
@Auth()
export class BiddingController {
  constructor(private readonly biddingService: BiddingService) {}

  @ApiOperation({
    summary: 'Размещение ставки на лот',
    description: 'Размещение указанного количества ставок на лот',
  })
  @ApiResponse({
    status: 200,
    description: 'Ставка успешно размещена',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Ставка размещена' },
        lotId: { type: 'string', example: 'uuid' },
        bidCount: { type: 'number', example: 5 },
        remainingBids: { type: 'number', example: 95 },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Недостаточно ставок или лот неактивен',
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: PlaceBidDto })
  @Post('place-bid')
  placeBid(@CurrentUser() user: User, @Body() placeBidDto: PlaceBidDto) {
    return this.biddingService.placeBid(user.id, placeBidDto);
  }

  @ApiOperation({
    summary: 'Получение ставок лота',
    description: 'Получение информации о всех ставках на конкретный лот',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о ставках лота',
    schema: {
      type: 'object',
      properties: {
        lotId: { type: 'string', example: 'uuid' },
        totalBids: { type: 'number', example: 150 },
        topBidders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', example: 'uuid' },
              userName: { type: 'string', example: 'Иван Иванов' },
              bidCount: { type: 'number', example: 25 },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'lotId',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @Get('lot/:lotId/bids')
  getLotBids(@Param('lotId') lotId: string) {
    return this.biddingService.getLotBids(lotId);
  }

  @ApiOperation({
    summary: 'Получение ставок пользователя на лот',
    description: 'Получение информации о ставках текущего пользователя на конкретный лот',
  })
  @ApiResponse({
    status: 200,
    description: 'Ставки пользователя на лот',
    schema: {
      type: 'object',
      properties: {
        lotId: { type: 'string', example: 'uuid' },
        userId: { type: 'string', example: 'uuid' },
        userBidCount: { type: 'number', example: 10 },
        userRank: { type: 'number', example: 3 },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'lotId',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @Get('lot/:lotId/user-bids')
  getUserBidsOnLot(@CurrentUser() user: User, @Param('lotId') lotId: string) {
    return this.biddingService.getUserBidsOnLot(lotId, user.id);
  }

  @ApiOperation({
    summary: 'Получение топ-биддеров лота',
    description: 'Получение списка пользователей с наибольшим количеством ставок на лот',
  })
  @ApiResponse({
    status: 200,
    description: 'Список топ-биддеров',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string', example: 'uuid' },
          userName: { type: 'string', example: 'Иван Иванов' },
          bidCount: { type: 'number', example: 50 },
          rank: { type: 'number', example: 1 },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'lotId',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Количество топ-биддеров для отображения',
    required: false,
    type: Number,
    example: 10,
  })
  @Get('lot/:lotId/top-bidders')
  getTopBidders(
    @Param('lotId') lotId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.biddingService.getTopBidders(lotId, limit || 10);
  }

  @ApiOperation({
    summary: 'Получение активных лотов с информацией о ставках',
    description: 'Получение всех активных лотов с детальной информацией о ставках',
  })
  @ApiResponse({
    status: 200,
    description: 'Список активных лотов с информацией о ставках',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'uuid' },
          title: { type: 'string', example: 'Золотое кольцо' },
          description: { type: 'string', example: 'Описание лота' },
          image: { type: 'string', example: '/uploads/image.jpg' },
          basePrice: { type: 'number', example: 50000 },
          periodSeconds: { type: 'number', example: 3600 },
          currentStart: { type: 'string', format: 'date-time' },
          currentEnd: { type: 'string', format: 'date-time' },
          isActive: { type: 'boolean', example: true },
          totalBids: { type: 'number', example: 150 },
          topBidders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userId: { type: 'string', example: 'uuid' },
                userName: { type: 'string', example: 'Иван Иванов' },
                bidCount: { type: 'number', example: 25 },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходима аутентификация',
  })
  @ApiBearerAuth('JWT-auth')
  @Get('active-lots')
  getAllActiveLotsWithBids() {
    return this.biddingService.getAllActiveLotsWithBids();
  }
}
