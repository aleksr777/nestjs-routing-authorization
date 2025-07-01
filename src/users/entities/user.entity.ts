import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  IsEmail,
  IsPhoneNumber,
  IsString,
  Length,
  IsNotEmpty,
  IsOptional,
  IsInt,
} from 'class-validator';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn({
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
    type: 'timestamp',
    select: false,
  })
  created_at!: Date;

  @UpdateDateColumn({
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    name: 'updated_at',
    type: 'timestamp',
    select: false,
  })
  updated_at!: Date;

  @IsNotEmpty()
  @IsEmail()
  @Length(6, 255)
  @Column({
    name: 'email',
    unique: true,
    select: false,
    length: 255,
  })
  email!: string;

  @IsOptional()
  @IsPhoneNumber()
  @Length(4, 30)
  @Column({
    name: 'phone_number',
    unique: true,
    nullable: true,
    select: false,
    length: 30,
  })
  phone_number?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Column({
    name: 'nickname',
    unique: true,
    nullable: true,
    length: 50,
  })
  nickname?: string | null;

  @IsNotEmpty()
  @IsString()
  @Length(8, 100)
  @Column({
    name: 'password',
    length: 100,
    select: false,
  })
  password!: string;

  @IsOptional()
  @IsInt()
  @Length(0, 200)
  @Column({
    type: 'smallint',
    name: 'age',
    nullable: true,
    length: 200,
  })
  age?: number | null;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  @Column({
    name: 'gender',
    nullable: true,
    length: 20,
  })
  gender?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Column({
    type: 'text',
    name: 'about',
    nullable: true,
    length: 1000,
  })
  about?: string | null;

  @Column({
    type: 'varchar',
    name: 'refresh_token',
    length: 512,
    nullable: true,
    select: false,
  })
  refresh_token?: string | null;
}
