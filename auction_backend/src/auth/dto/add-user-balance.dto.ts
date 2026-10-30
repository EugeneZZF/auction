import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class AddUserBalanceDto {
  @ApiProperty({ description: 'Сумма пополнения в целых рублях', minimum: 1, maximum: 1000000, example: 500 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amountRubles: number;
}
