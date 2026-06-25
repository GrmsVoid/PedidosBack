import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

export type TestDb = {
  prisma: PrismaClient;
  url: string;
  stop: () => Promise<void>;
};

export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  )
    .withDatabase("cafeteria_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const url = container.getConnectionUri();
  execSync(`pnpm exec prisma db push --skip-generate`, {
    env: { ...process.env, DATABASE_URL: url, NODE_OPTIONS: "--use-system-ca" },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
