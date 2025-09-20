import { IsNotEmpty, IsString } from 'class-validator';

export class RegistrationConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
