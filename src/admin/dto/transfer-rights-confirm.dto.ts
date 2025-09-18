import { IsNotEmpty } from 'class-validator';

export class TransferConfirmDto {
  @IsNotEmpty()
  token!: string;
}
