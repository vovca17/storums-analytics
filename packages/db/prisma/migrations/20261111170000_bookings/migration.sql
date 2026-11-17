-- CreateEnum
CREATE TYPE "public"."BookingPlatform" AS ENUM ('DIRECT', 'AVITO', 'SUTOCHNO', 'OSTROVOK', 'YANDEX', 'OTHER');

-- AlterEnum
ALTER TYPE "public"."TransactionSource" ADD VALUE 'BOOKING';

-- AlterTable
ALTER TABLE "public"."Property" ADD COLUMN     "dailyRent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "bookingId" UUID;

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "cleaningFee" DECIMAL(14,2),
    "commission" DECIMAL(14,2),
    "platform" "public"."BookingPlatform" NOT NULL DEFAULT 'DIRECT',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_propertyId_checkIn_idx" ON "public"."Booking"("propertyId", "checkIn");

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Закрыть для Supabase REST, как остальные таблицы (см. enable_rls)
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
