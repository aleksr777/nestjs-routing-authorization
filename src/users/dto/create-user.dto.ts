import {
  IsString,
  IsEmail,
  IsPhoneNumber,
  Length,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(2, 50)
  nickname!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 100)
  password!: string;

  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  about?: string;
}
