-- CreateEnum
CREATE TYPE "public"."EventKind" AS ENUM ('CLEANING', 'METER_READINGS', 'PAYMENT', 'REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."Recurrence" AS ENUM ('NONE', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "propertyId" UUID,
    "title" TEXT NOT NULL,
    "kind" "public"."EventKind" NOT NULL DEFAULT 'OTHER',
    "date" DATE NOT NULL,
    "recurrence" "public"."Recurrence" NOT NULL DEFAULT 'NONE',
    "remindDaysBefore" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(14,2),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventCompletion" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_ownerId_idx" ON "public"."Event"("ownerId");

-- CreateIndex
CREATE INDEX "Event_propertyId_idx" ON "public"."Event"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCompletion_eventId_occurrenceDate_key" ON "public"."EventCompletion"("eventId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventCompletion" ADD CONSTRAINT "EventCompletion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Новые таблицы закрыты для Supabase REST, как и остальные (см. enable_rls)
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventCompletion" ENABLE ROW LEVEL SECURITY;
