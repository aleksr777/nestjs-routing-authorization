import { IsNotEmpty } from 'class-validator';

export class EmailChangeConfirmDto {
  @IsNotEmpty()
  token!: string;
}
