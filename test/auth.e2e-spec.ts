import {
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { PasswordResetService } from '../src/auth/password-reset.service';
import { PublicVerificationRateLimitService } from '../src/auth/public-verification-rate-limit.service';
import { RegistrationService } from '../src/auth/registration.service';
import { RefreshTokenGuard } from '../src/auth/guards/refresh-token.guard';
import { ErrorsService } from '../src/common/errors-service/errors.service';

const refreshTokens = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  access_token_expires: 1_900_000_000,
  refresh_token_expires: 1_900_000_100,
};

type AuthResponseBody = {
  access_token: string;
  access_token_expires: number;
  refresh_token?: unknown;
};

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  const authService = {
    refreshJwtTokens: jest.fn(),
  };
  const registrationService = {
    request: jest.fn(),
    resend: jest.fn(),
    confirm: jest.fn(),
  };
  const passwordResetService = {
    request: jest.fn(),
    confirm: jest.fn(),
  };
  const publicVerificationRateLimitService = {
    consume: jest.fn(),
  };

  const getServer = (): Server => app.getHttpServer() as Server;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        ErrorsService,
        { provide: AuthService, useValue: authService },
        { provide: RegistrationService, useValue: registrationService },
        { provide: PasswordResetService, useValue: passwordResetService },
        {
          provide: PublicVerificationRateLimitService,
          useValue: publicVerificationRateLimitService,
        },
      ],
    })
      .overrideGuard(RefreshTokenGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: { id: number } } };
        }) => {
          context.switchToHttp().getRequest().user = { id: 7 };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('applies the public verification limiter before registration', async () => {
    publicVerificationRateLimitService.consume.mockResolvedValue(undefined);
    registrationService.request.mockResolvedValue({
      message: 'If the email exists, we’ve sent you a code.',
      retry_after: 60,
      max_attempts: 5,
    });

    const response = await request(getServer())
      .post('/api/auth/registration/request')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(201);

    expect(publicVerificationRateLimitService.consume).toHaveBeenCalledTimes(1);
    expect(registrationService.request).toHaveBeenCalledWith(
      'user@example.com',
      'password123',
    );
    expect(response.body as Record<string, unknown>).toMatchObject({
      retry_after: 60,
      max_attempts: 5,
    });
  });

  it('returns 429 when the public verification IP limit is exceeded', async () => {
    publicVerificationRateLimitService.consume.mockRejectedValue(
      new HttpException(
        {
          message: 'Too many verification code requests from this IP.',
          retry_after: 300,
        },
        429,
      ),
    );

    const response = await request(getServer())
      .post('/api/auth/password-reset/request')
      .send({ email: 'user@example.com' })
      .expect(429);

    expect(passwordResetService.request).not.toHaveBeenCalled();
    expect(response.body as Record<string, unknown>).toMatchObject({
      retry_after: 300,
    });
  });

  it('rotates the refresh cookie without exposing the refresh token in JSON', async () => {
    authService.refreshJwtTokens.mockResolvedValue(refreshTokens);

    const response = await request(getServer())
      .post('/api/auth/refresh-tokens')
      .set('Cookie', ['refresh_token=old-refresh-token'])
      .expect(201);

    const body = response.body as AuthResponseBody;

    expect(authService.refreshJwtTokens).toHaveBeenCalledWith(
      7,
      'old-refresh-token',
    );
    expect(body).toEqual({
      access_token: 'new-access-token',
      access_token_expires: 1_900_000_000,
    });
    expect(body.refresh_token).toBeUndefined();
    expect(response.headers['set-cookie']?.[0]).toContain(
      'refresh_token=new-refresh-token',
    );
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('rejects invalid registration payloads before calling the service', async () => {
    await request(getServer())
      .post('/api/auth/registration/request')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(registrationService.request).not.toHaveBeenCalled();
  });
});
