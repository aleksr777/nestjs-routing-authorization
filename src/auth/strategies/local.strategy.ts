import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private readonly usersService: UsersService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const userId = await this.usersService.validateUser(email, password);
    return { id: userId };
  }
}
