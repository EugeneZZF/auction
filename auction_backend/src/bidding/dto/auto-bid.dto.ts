import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class EnableAutoBidDto {
  @IsString()
  lotId: string;

  @IsNumber()
  @Min(1)
  @Max(1000)
  maxBids: number;
}

export class DisableAutoBidDto {
  @IsString()
  lotId: string;
}

export class AutoBidStatusDto {
  @IsString()
  lotId: string;

  @IsOptional()
  @IsNumber()
  maxBids?: number;

  @IsOptional()
  @IsNumber()
  currentBids?: number;
}
