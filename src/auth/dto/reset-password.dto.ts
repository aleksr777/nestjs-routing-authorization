import { IsString, Length, IsUUID, IsNotEmpty } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  newPassword!: string;
}
