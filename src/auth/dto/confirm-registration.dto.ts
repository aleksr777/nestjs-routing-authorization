import { IsUUID, IsNotEmpty } from 'class-validator';

export class ConfirmRegistrationDto {
  @IsUUID()
  @IsNotEmpty()
  token!: string;
}
