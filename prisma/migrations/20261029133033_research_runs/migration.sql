-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "stepLockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchRun_stage_updatedAt_idx" ON "ResearchRun"("stage", "updatedAt");
