-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "value" DECIMAL(14,2);
