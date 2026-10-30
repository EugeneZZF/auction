import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlaceBidDto {
  @ApiProperty({
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @IsString()
  lotId: string;

  @ApiProperty({
    description: 'Количество ставок для размещения',
    example: 5,
    minimum: 1,
  })
  @IsNumber()
  @Min(1, { message: 'Количество ставок должно быть не менее 1' })
  bidCount: number; // количество ставок для размещения
}
