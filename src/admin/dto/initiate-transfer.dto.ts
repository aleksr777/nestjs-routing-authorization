import { IsNotEmpty, IsString } from 'class-validator';

export class InitiateTransferDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}
