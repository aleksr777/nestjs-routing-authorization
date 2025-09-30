import { IsPhoneNumber, IsNotEmpty } from 'class-validator';

export class PhoneVerificationRequestDto {
  @IsNotEmpty()
  @IsPhoneNumber()
  phone!: string;
}
