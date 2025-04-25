import { IsInt, Min, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetUsersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number;

  @IsOptional()
  @IsString()
  nickname?: string;
}
