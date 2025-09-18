import { IsNotEmpty } from 'class-validator';

export class RegistrationConfirmDto {
  @IsNotEmpty()
  token!: string;
}
