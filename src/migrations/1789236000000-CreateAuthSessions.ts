import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1789236000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_session" (
        "id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "refresh_token_hash" varchar(64) NOT NULL,
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "last_used_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "revoked_reason" varchar(64),
        CONSTRAINT "PK_auth_session_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_session_user_id" FOREIGN KEY ("user_id")
          REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_session_user_id" ON "auth_session" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_session_user_revoked" ON "auth_session" ("user_id", "revoked_at")',
    );

    // Refresh JWTs issued before session IDs existed cannot be mapped safely to
    // a session row. Invalidate their legacy hashes so deployment fails closed.
    await queryRunner.query('UPDATE "user" SET "refresh_token" = NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_auth_session_user_revoked"');
    await queryRunner.query('DROP INDEX "IDX_auth_session_user_id"');
    await queryRunner.query('DROP TABLE "auth_session"');
  }
}
