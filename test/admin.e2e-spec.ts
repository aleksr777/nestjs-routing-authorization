import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { Server } from 'node:http';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { SecurityAuditService } from '../src/audit/security-audit.service';
import { ErrorsService } from '../src/common/errors-service/errors.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Role } from '../src/common/types/role.enum';

describe('administrator action HTTP contract', () => {
  let app: INestApplication;
  let role: Role | null;
  const admin = {
    blockUserById: jest.fn(),
    unblockUserById: jest.fn(),
    deleteUserById: jest.fn(),
  };
  const auth = { verifyUserPassword: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    role = Role.ADMIN;
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        ErrorsService,
        RolesGuard,
        { provide: AdminService, useValue: admin },
        { provide: AuthService, useValue: auth },
        { provide: SecurityAuditService, useValue: { record: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!role) throw new UnauthorizedException();
          ctx.switchToHttp().getRequest<Request>().user = { id: 1, role };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const server = (): Server => app.getHttpServer() as Server;

  it('accepts block and unblock without asking for an administrator password', async () => {
    await request(server())
      .patch('/api/admin/users/block/2')
      .send({ blocked_reason: 'Reason' })
      .expect(200);
    expect(admin.blockUserById).toHaveBeenCalledWith(1, 2, 'Reason');
    await request(server()).patch('/api/admin/users/unblock/2').expect(200);
    expect(admin.unblockUserById).toHaveBeenCalledWith(2);
    expect(auth.verifyUserPassword).not.toHaveBeenCalled();
  });
  it('still requires a password for deletion', async () => {
    await request(server())
      .delete('/api/admin/users/delete/2')
      .send({})
      .expect(400);
    expect(admin.deleteUserById).not.toHaveBeenCalled();
    await request(server())
      .delete('/api/admin/users/delete/2')
      .send({ password: 'admin-password' })
      .expect(200);
    expect(admin.deleteUserById).toHaveBeenCalledWith(1, 2, 'admin-password');
  });
  it.each([Role.USER, null])(
    'rejects unauthorised block requests with role %s',
    async (testRole) => {
      role = testRole;
      await request(server())
        .patch('/api/admin/users/block/2')
        .send({})
        .expect(testRole ? 403 : 401);
      expect(admin.blockUserById).not.toHaveBeenCalled();
    },
  );
});
