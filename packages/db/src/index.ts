import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ override: true });
loadEnv({ path: path.resolve(__dirname, "../../../.env"), override: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize Prisma.");
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

export { PrismaClient };
