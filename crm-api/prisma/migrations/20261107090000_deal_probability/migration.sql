-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "probability" INTEGER NOT NULL DEFAULT 0;

-- Existing deals start with the probability of the stage they are in.
UPDATE "Deal" SET "probability" = "Stage"."probability" FROM "Stage" WHERE "Deal"."stageId" = "Stage"."id";
