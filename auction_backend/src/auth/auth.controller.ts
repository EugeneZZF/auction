import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  UsePipes,
  ValidationPipe,
  Query,
  Param,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './dto/auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginCodeDto } from './dto/verify-login-code.dto';
import { ResendLoginCodeDto } from './dto/resend-login-code.dto';
import { GrantAdminRoleDto } from './dto/grant-admin-role.dto';
import { AddUserBalanceDto } from './dto/add-user-balance.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { Auth } from './decorators/auth.decorator';
import { Admin } from './decorators/admin.decorator';
import { CurrentUser } from './decorators';
import { User } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Вход в систему',
    description: 'Аутентификация пользователя по email и паролю',
  })
  @ApiResponse({
    status: 200,
    description: 'Успешная аутентификация',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          description: 'JWT access токен',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        refreshToken: {
          type: 'string',
          description: 'JWT refresh токен',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'uuid' },
            email: { type: 'string', example: 'user@example.com' },
            name: { type: 'string', example: 'Иван Иванов' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
            balance: { type: 'number', example: 10000 },
            bids: { type: 'number', example: 5 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Неверные учетные данные',
  })
  @ApiBody({ type: LoginDto })
  @UsePipes(new ValidationPipe())
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiOperation({ summary: 'Подтверждение входа кодом из email' })
  @ApiBody({ type: VerifyLoginCodeDto })
  @ApiResponse({ status: 200, description: 'Код подтверждён, токены выданы' })
  @ApiResponse({ status: 401, description: 'Код неверный или просрочен' })
  @UsePipes(new ValidationPipe())
  @HttpCode(200)
  @Post('login/verify')
  async verifyLoginCode(@Body() dto: VerifyLoginCodeDto) {
    return this.authService.verifyLoginCode(dto);
  }

  @ApiOperation({ summary: 'Повторная отправка кода подтверждения' })
  @ApiBody({ type: ResendLoginCodeDto })
  @ApiResponse({ status: 200, description: 'Новый код отправлен на email' })
  @ApiResponse({ status: 429, description: 'Слишком частые запросы' })
  @UsePipes(new ValidationPipe())
  @HttpCode(200)
  @Post('login/resend')
  async resendLoginCode(@Body() dto: ResendLoginCodeDto) {
    return this.authService.resendLoginCode(dto);
  }

  @ApiOperation({
    summary: 'Обновление токенов',
    description: 'Получение новых access и refresh токенов по refresh токену',
  })
  @ApiResponse({
    status: 200,
    description: 'Токены успешно обновлены',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          description: 'Новый JWT access токен',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        refreshToken: {
          type: 'string',
          description: 'Новый JWT refresh токен',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Недействительный refresh токен',
  })
  @ApiBody({ type: RefreshTokenDto })
  @UsePipes(new ValidationPipe())
  @HttpCode(200)
  @Post('login/access-token')
  async getNewTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.getNewTokens(dto.refreshToken);
  }

  @ApiOperation({
    summary: 'Регистрация пользователя',
    description: 'Создание нового аккаунта пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Пользователь успешно зарегистрирован',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          description: 'JWT access токен',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        refreshToken: {
          type: 'string',
          description: 'JWT refresh токен',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'uuid' },
            email: { type: 'string', example: 'user@example.com' },
            name: { type: 'string', example: 'Иван Иванов' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
            balance: { type: 'number', example: 0 },
            bids: { type: 'number', example: 0 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Пользователь с таким email уже существует',
  })
  @ApiBody({ type: AuthDto })
  @UsePipes(new ValidationPipe())
  @HttpCode(200)
  @Post('register')
  async register(@Body() dto: AuthDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Назначить пользователю роль администратора' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Роль администратора назначена' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(200)
  @Post('roles/admin')
  @Auth()
  async grantAdminRole(@Body() dto: GrantAdminRoleDto) {
    return this.authService.grantAdminRole(dto.email);
  }

  @ApiOperation({ summary: 'Найти пользователей для администрирования' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Список пользователей без паролей' })
  @Get('admin/users')
  @Admin()
  async searchAdminUsers(@Query('search') search?: string) {
    return this.authService.searchAdminUsers(search);
  }

  @ApiOperation({ summary: 'Пополнить баланс пользователя' })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: AddUserBalanceDto })
  @ApiResponse({ status: 200, description: 'Баланс пополнен; сумма указана в рублях' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(200)
  @Patch('admin/users/:id/balance')
  @Admin()
  async addUserBalance(
    @Param('id') id: string,
    @Body() dto: AddUserBalanceDto,
  ) {
    return this.authService.addUserBalance(id, dto.amountRubles);
  }

  @ApiOperation({ summary: 'Изменить email или пароль пользователя' })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: UpdateAdminUserDto })
  @ApiResponse({ status: 200, description: 'Данные учетной записи изменены' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(200)
  @Patch('admin/users/:id')
  @Admin()
  async updateAdminUser(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.authService.updateAdminUser(id, dto);
  }

  @ApiOperation({
    summary: 'Получение побед пользователя',
    description: 'Получение списка всех выигранных лотов пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Список побед пользователя',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'uuid' },
          lotId: { type: 'string', example: 'uuid' },
          wonAt: { type: 'string', format: 'date-time', example: '2024-01-01T12:00:00Z' },
          lot: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'uuid' },
              title: { type: 'string', example: 'Золотое кольцо' },
              description: { type: 'string', example: 'Красивое золотое кольцо' },
              image: { type: 'string', example: '/uploads/image.jpg' },
              basePrice: { type: 'number', example: 50000 },
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
  @UsePipes(new ValidationPipe())
  @HttpCode(200)
  @Get('user/wins')
  @Auth()
  async getUserWins(@CurrentUser() user: User) {
    return this.authService.getUserWins(user); // Передаем user, а не весь req
  }

  @ApiOperation({ summary: 'Получение данных личного кабинета' })
  @ApiBearerAuth('JWT-auth')
  @Get('user/profile')
  @Auth()
  async getUserProfile(@CurrentUser() user: User) {
    return this.authService.getUserProfile(user);
  }

  @ApiOperation({ summary: 'История ставок пользователя' })
  @ApiBearerAuth('JWT-auth')
  @Get('user/bids')
  @Auth()
  async getUserBidHistory(@CurrentUser() user: User) {
    return this.authService.getUserBidHistory(user);
  }
}
