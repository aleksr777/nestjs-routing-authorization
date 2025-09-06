import { MaxLength, IsString, IsOptional } from 'class-validator';

export class BlockUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  blocked_reason?: string;
}
