import { IsInt, Min, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  nickname?: string;
}
