import { IsInt, Min } from 'class-validator';

export class TransferInitiateDto {
  @IsInt()
  @Min(1)
  id!: number;
}
