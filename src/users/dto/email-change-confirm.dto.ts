import { IsNotEmpty, IsString } from 'class-validator';

export class EmailChangeConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
