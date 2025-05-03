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
    type: 'timestamp',
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;

  @IsNotEmpty()
  @IsString()
  @Length(2, 50)
  @Column({
    unique: true,
    length: 50,
  })
  nickname!: string;

  @IsNotEmpty()
  @IsEmail()
  @Column({
    unique: true,
    length: 255,
  })
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Length(8, 100)
  @Column({
    select: false,
    length: 100,
  })
  password!: string;

  @IsOptional()
  @IsPhoneNumber()
  @Column({
    nullable: true,
    unique: true,
    length: 20,
    name: 'phone_number',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  @Column({
    nullable: true,
    type: 'smallint',
  })
  age?: number;

  @IsOptional()
  @IsString()
  @Column({
    nullable: true,
    length: 20,
  })
  gender?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Column({
    nullable: true,
    type: 'text',
  })
  about?: string;
}
