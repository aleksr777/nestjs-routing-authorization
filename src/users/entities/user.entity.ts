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
  Min,
  Max,
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
  @Column({ name: 'email', unique: true, length: 255, select: false })
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Length(8, 100)
  @Column({ name: 'password', length: 100, select: false })
  password!: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Column({ name: 'nickname', nullable: true, unique: true, length: 50 })
  nickname?: string;

  @IsOptional()
  @IsPhoneNumber()
  @Column({
    name: 'phone_number',
    nullable: true,
    unique: true,
    length: 20,
    select: false,
  })
  phone_number?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  @Column({ name: 'age', nullable: true, type: 'smallint' })
  age?: number;

  @IsOptional()
  @IsString()
  @Column({ name: 'gender', nullable: true, length: 20 })
  gender?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Column({ name: 'about', nullable: true, type: 'text' })
  about?: string;

  @Column({
    name: 'refresh_token',
    type: 'varchar',
    length: 512,
    nullable: true,
    select: false,
  })
  refresh_token?: string;
}
