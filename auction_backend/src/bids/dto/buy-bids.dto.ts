import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BuyBidsDto {
  @ApiProperty({
    description: 'Количество ставок для покупки',
    example: 10,
    minimum: 1,
    maximum: 1000,
  })
  @IsNumber()
  @Min(1, { message: 'Минимальное количество ставок: 1' })
  @Max(1000, { message: 'Максимальное количество ставок за раз: 1000' })
  quantity: number; // количество ставок для покупки
}
