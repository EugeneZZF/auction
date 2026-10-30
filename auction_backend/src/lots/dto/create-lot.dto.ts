import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLotDto {
  @ApiProperty({
    description: 'Описание лота',
    example: 'Красивое золотое кольцо с бриллиантом 1 карат',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Номинал банкноты в копейках',
    enum: [50_000, 100_000, 200_000, 500_000],
    example: 100_000,
  })
  @IsNumber()
  @IsIn([50_000, 100_000, 200_000, 500_000])
  basePrice: number; // в копейках

  @ApiProperty({
    description: 'Период розыгрыша в секундах',
    example: 3600,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  periodSeconds: number; // период розыгрыша в секундах

  @ApiProperty({
    description: 'Активен ли лот',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Окно неактивности в миллисекундах (по истечении закрываем лот)',
    example: 10000,
    minimum: 1000,
    required: false,
    default: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  inactivityTimeoutMs?: number; // окно неактивности в мс, по умолчанию 10000
}
