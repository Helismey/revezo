-- DropIndex
DROP INDEX IF EXISTS "Assignment_userId_idx";

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- AlterTable
ALTER TABLE "Church" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "recurrenceGroupId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guardianConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guardianName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guardianPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isMinor" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assignment_userId_status_idx" ON "Assignment"("userId", "status");
CREATE INDEX IF NOT EXISTS "Assignment_status_idx" ON "Assignment"("status");
CREATE INDEX IF NOT EXISTS "Assignment_approvedById_idx" ON "Assignment"("approvedById");
CREATE INDEX IF NOT EXISTS "Department_createdById_idx" ON "Department"("createdById");
CREATE INDEX IF NOT EXISTS "MemberFunction_functionId_idx" ON "MemberFunction"("functionId");
CREATE INDEX IF NOT EXISTS "Program_date_idx" ON "Program"("date");
CREATE INDEX IF NOT EXISTS "Program_recurrenceGroupId_idx" ON "Program"("recurrenceGroupId");
CREATE INDEX IF NOT EXISTS "Program_createdById_idx" ON "Program"("createdById");
CREATE INDEX IF NOT EXISTS "ProgramDepartment_departmentId_idx" ON "ProgramDepartment"("departmentId");
CREATE INDEX IF NOT EXISTS "ProgramSlot_startsAt_idx" ON "ProgramSlot"("startsAt");
CREATE INDEX IF NOT EXISTS "ProgramSlot_departmentId_startsAt_idx" ON "ProgramSlot"("departmentId", "startsAt");
CREATE INDEX IF NOT EXISTS "ProgramSlot_functionId_idx" ON "ProgramSlot"("functionId");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE INDEX IF NOT EXISTS "SwapRequest_reviewedById_idx" ON "SwapRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "User_churchId_status_idx" ON "User"("churchId", "status");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_appointedById_idx" ON "User"("appointedById");

-- AddForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_approvedById_fkey";
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
