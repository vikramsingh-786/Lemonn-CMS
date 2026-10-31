-- CreateTable
CREATE TABLE "SourceSetting" (
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceSetting_pkey" PRIMARY KEY ("sourceId")
);
