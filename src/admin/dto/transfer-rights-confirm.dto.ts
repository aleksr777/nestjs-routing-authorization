import { IsNotEmpty, IsString } from 'class-validator';

export class TransferConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
