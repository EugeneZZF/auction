import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @ApiProperty({
    description: 'Email пользователя',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Пароль пользователя (минимум 6 символов)',
    example: 'password123',
    minLength: 6,
  })
  @MinLength(6, {
    message: 'Password must be at least 6 characters long',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'Имя пользователя',
    example: 'Иван Иванов',
  })
  @IsString()
  name: string;
}
