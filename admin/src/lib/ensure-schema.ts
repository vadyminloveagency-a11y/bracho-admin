import { prisma } from "@/lib/db";

let ensured = false;

/** Idempotent DB tweaks for Account Manager (runs once per process). */
export async function ensureSchema() {
  if (ensured) return;
  ensured = true;

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Anketa" ALTER COLUMN "operatorId" DROP NOT NULL
    `);
  } catch {
    // already nullable or table missing — ignore
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AnketaPresence" (
        "anketaId" TEXT NOT NULL,
        "operatorId" TEXT NOT NULL,
        "externalId" TEXT NOT NULL,
        "displayName" TEXT NOT NULL,
        "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AnketaPresence_pkey" PRIMARY KEY ("anketaId")
      )
    `);
  } catch {
    // ignore
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AnketaPresence_lastSeenAt_idx"
      ON "AnketaPresence"("lastSeenAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AnketaPresence_operatorId_idx"
      ON "AnketaPresence"("operatorId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Anketa_operatorId_idx"
      ON "Anketa"("operatorId")
    `);
  } catch {
    // ignore
  }

  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "AnketaPresence"
          ADD CONSTRAINT "AnketaPresence_anketaId_fkey"
          FOREIGN KEY ("anketaId") REFERENCES "Anketa"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "AnketaPresence"
          ADD CONSTRAINT "AnketaPresence_operatorId_fkey"
          FOREIGN KEY ("operatorId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  } catch {
    // ignore
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Anketa" DROP CONSTRAINT IF EXISTS "Anketa_operatorId_fkey"
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Anketa"
        ADD CONSTRAINT "Anketa_operatorId_fkey"
        FOREIGN KEY ("operatorId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    `);
  } catch {
    // ignore
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Anketa" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT
    `);
  } catch {
    // ignore
  }
}
