ALTER TABLE "public"."Transaction"
  ADD COLUMN "rentPeriod" VARCHAR(7),
  ADD COLUMN "paymentKey" UUID;

-- Раньше месяц аренды определялся датой операции. Сохраняем эту привязку для истории.
UPDATE "public"."Transaction" AS t
SET "rentPeriod" = to_char(t."date", 'YYYY-MM')
FROM "public"."Category" AS c
WHERE t."categoryId" = c.id AND c."systemKey" = 'rent'
  AND t.type = 'INCOME' AND t."leaseId" IS NOT NULL;

ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_rentPeriod_check"
  CHECK ("rentPeriod" IS NULL OR "rentPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
CREATE UNIQUE INDEX "Transaction_paymentKey_key" ON "public"."Transaction"("paymentKey");
CREATE INDEX "Transaction_leaseId_rentPeriod_idx" ON "public"."Transaction"("leaseId", "rentPeriod");
