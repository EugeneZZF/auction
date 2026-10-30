import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new WsException('Токен не предоставлен');
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload;

      return true;
    } catch (err) {
      // Проверяем конкретный тип ошибки JWT
      if (err instanceof Error) {
        if (err.name === 'TokenExpiredError') {
          throw new WsException('jwt expired');
        }
        if (err.name === 'JsonWebTokenError') {
          throw new WsException('Недействительный токен');
        }
        if (err.name === 'NotBeforeError') {
          throw new WsException('Токен еще не активен');
        }
      }
      throw new WsException('Ошибка аутентификации');
    }
  }
}
