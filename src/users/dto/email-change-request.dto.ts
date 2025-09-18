import { IsEmail } from 'class-validator';
export class EmailChangeRequestDto {
  @IsEmail()
  new_email!: string;
}
