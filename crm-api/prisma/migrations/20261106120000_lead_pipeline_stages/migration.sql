-- Lead stages become the sales pipeline: New → Contacted → Qualified → Proposal Sent → Negotiation → Won / Lost.
-- Existing leads: UNQUALIFIED becomes LOST and CONVERTED becomes WON.
ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST');

ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus" USING (
  CASE "status"::text
    WHEN 'UNQUALIFIED' THEN 'LOST'
    WHEN 'CONVERTED' THEN 'WON'
    ELSE "status"::text
  END
)::"LeadStatus";
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';

DROP TYPE "LeadStatus_old";
