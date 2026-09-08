import { IsInt, IsString, Length, Min } from 'class-validator';

export class TransferInitiateDto {
  @IsInt()
  @Min(1)
  id!: number;

  @IsString()
  @Length(8, 100)
  password!: string;
}
