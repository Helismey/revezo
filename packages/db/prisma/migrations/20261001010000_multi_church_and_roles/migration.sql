-- CreateTable
CREATE TABLE IF NOT EXISTS "Church" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1E40AF',
    "secondaryColor" TEXT NOT NULL DEFAULT '#F59E0B',
    "address" JSONB,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PastorChurch" (
    "pastorId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastorChurch_pkey" PRIMARY KEY ("pastorId","churchId")
);

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "churchId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appointedById" TEXT;

-- AlterTable Department
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "churchId" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "createdByRole" "GlobalRole";

-- AlterTable Program
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "churchId" TEXT;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "createdByRole" "GlobalRole";

-- AlterTable AuditLog
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "churchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Church_slug_key" ON "Church"("slug");
CREATE INDEX IF NOT EXISTS "PastorChurch_pastorId_idx" ON "PastorChurch"("pastorId");
CREATE INDEX IF NOT EXISTS "PastorChurch_churchId_idx" ON "PastorChurch"("churchId");
CREATE INDEX IF NOT EXISTS "User_churchId_idx" ON "User"("churchId");

DROP INDEX IF EXISTS "Department_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Department_churchId_name_key" ON "Department"("churchId", "name");
CREATE INDEX IF NOT EXISTS "Department_churchId_idx" ON "Department"("churchId");

CREATE INDEX IF NOT EXISTS "Program_churchId_date_idx" ON "Program"("churchId", "date");
CREATE INDEX IF NOT EXISTS "AuditLog_churchId_createdAt_idx" ON "AuditLog"("churchId", "createdAt");

-- AddForeignKey
ALTER TABLE "PastorChurch" DROP CONSTRAINT IF EXISTS "PastorChurch_pastorId_fkey";
ALTER TABLE "PastorChurch" ADD CONSTRAINT "PastorChurch_pastorId_fkey" FOREIGN KEY ("pastorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PastorChurch" DROP CONSTRAINT IF EXISTS "PastorChurch_churchId_fkey";
ALTER TABLE "PastorChurch" ADD CONSTRAINT "PastorChurch_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_churchId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_appointedById_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_appointedById_fkey" FOREIGN KEY ("appointedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_churchId_fkey";
ALTER TABLE "Department" ADD CONSTRAINT "Department_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_createdById_fkey";
ALTER TABLE "Department" ADD CONSTRAINT "Department_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Program" DROP CONSTRAINT IF EXISTS "Program_churchId_fkey";
ALTER TABLE "Program" ADD CONSTRAINT "Program_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Program" DROP CONSTRAINT IF EXISTS "Program_createdById_fkey";
ALTER TABLE "Program" ADD CONSTRAINT "Program_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_churchId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;
