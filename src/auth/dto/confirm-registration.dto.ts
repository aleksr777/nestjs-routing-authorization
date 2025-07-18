import { IsUUID } from 'class-validator';

export class ConfirmRegistrationDto {
  @IsUUID()
  token!: string;
}
