import { IsNotEmpty, IsString } from 'class-validator';

export class RegistrationConfirmDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
