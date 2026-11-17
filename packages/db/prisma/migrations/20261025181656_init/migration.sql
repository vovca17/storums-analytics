-- CreateEnum
CREATE TYPE "public"."TaxRegime" AS ENUM ('NPD', 'NDFL', 'USN6');

-- CreateEnum
CREATE TYPE "public"."SubscriptionPlan" AS ENUM ('BETA', 'FREE', 'PRO');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."PropertyStatus" AS ENUM ('RENTED', 'VACANT', 'RENOVATION', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."UtilitiesPaidBy" AS ENUM ('OWNER', 'TENANT', 'SPLIT');

-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "public"."TransactionSource" AS ENUM ('MANUAL', 'UTILITY_CALC', 'LEASE_SCHEDULE', 'IMPORT');

-- CreateEnum
CREATE TYPE "public"."MeterKind" AS ENUM ('COLD_WATER', 'HOT_WATER', 'WATER_DISPOSAL', 'ELECTRICITY', 'ELECTRICITY_DAY', 'ELECTRICITY_NIGHT', 'GAS', 'HEAT');

-- CreateEnum
CREATE TYPE "public"."FixedChargeCalc" AS ENUM ('FIXED', 'PER_M2', 'PER_PERSON');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "taxRegime" "public"."TaxRegime" NOT NULL DEFAULT 'NPD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "plan" "public"."SubscriptionPlan" NOT NULL DEFAULT 'BETA',
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "provider" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Property" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "areaM2" DECIMAL(8,2) NOT NULL,
    "residents" INTEGER NOT NULL DEFAULT 1,
    "purchasePrice" DECIMAL(14,2),
    "purchaseDate" DATE,
    "status" "public"."PropertyStatus" NOT NULL DEFAULT 'VACANT',
    "mortgage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isLegalEntity" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lease" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "rentAmount" DECIMAL(14,2) NOT NULL,
    "paymentDay" INTEGER NOT NULL DEFAULT 1,
    "deposit" DECIMAL(14,2),
    "utilitiesPaidBy" "public"."UtilitiesPaidBy" NOT NULL DEFAULT 'OWNER',
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "name" TEXT NOT NULL,
    "type" "public"."TransactionType" NOT NULL,
    "parentId" UUID,
    "icon" TEXT,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "leaseId" UUID,
    "type" "public"."TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "comment" TEXT,
    "source" "public"."TransactionSource" NOT NULL DEFAULT 'MANUAL',
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "attachmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Meter" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "kind" "public"."MeterKind" NOT NULL,
    "serial" TEXT,
    "verificationDue" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeterReading" (
    "id" UUID NOT NULL,
    "meterId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tariff" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "regionCode" TEXT NOT NULL,
    "kind" "public"."MeterKind" NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "source" TEXT,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FixedCharge" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "calc" "public"."FixedChargeCalc" NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UtilityBill" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilityBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."File" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "public"."Subscription"("userId");

-- CreateIndex
CREATE INDEX "Property_ownerId_idx" ON "public"."Property"("ownerId");

-- CreateIndex
CREATE INDEX "Tenant_ownerId_idx" ON "public"."Tenant"("ownerId");

-- CreateIndex
CREATE INDEX "Lease_propertyId_idx" ON "public"."Lease"("propertyId");

-- CreateIndex
CREATE INDEX "Lease_tenantId_idx" ON "public"."Lease"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_systemKey_key" ON "public"."Category"("systemKey");

-- CreateIndex
CREATE INDEX "Category_ownerId_idx" ON "public"."Category"("ownerId");

-- CreateIndex
CREATE INDEX "Transaction_propertyId_date_idx" ON "public"."Transaction"("propertyId", "date");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "public"."Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Meter_propertyId_idx" ON "public"."Meter"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "MeterReading_meterId_period_key" ON "public"."MeterReading"("meterId", "period");

-- CreateIndex
CREATE INDEX "Tariff_regionCode_kind_validFrom_idx" ON "public"."Tariff"("regionCode", "kind", "validFrom");

-- CreateIndex
CREATE INDEX "FixedCharge_propertyId_idx" ON "public"."FixedCharge"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "UtilityBill_transactionId_key" ON "public"."UtilityBill"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "UtilityBill_propertyId_period_key" ON "public"."UtilityBill"("propertyId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "File_bucket_path_key" ON "public"."File"("bucket", "path");

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Property" ADD CONSTRAINT "Property_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tenant" ADD CONSTRAINT "Tenant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lease" ADD CONSTRAINT "Lease_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lease" ADD CONSTRAINT "Lease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lease" ADD CONSTRAINT "Lease_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "public"."Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meter" ADD CONSTRAINT "Meter_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeterReading" ADD CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "public"."Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tariff" ADD CONSTRAINT "Tariff_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedCharge" ADD CONSTRAINT "FixedCharge_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UtilityBill" ADD CONSTRAINT "UtilityBill_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UtilityBill" ADD CONSTRAINT "UtilityBill_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
