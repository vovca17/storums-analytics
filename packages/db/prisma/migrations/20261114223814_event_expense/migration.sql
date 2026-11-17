-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "countAsExpense" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "eventCompletionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_eventCompletionId_key" ON "Transaction"("eventCompletionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_eventCompletionId_fkey" FOREIGN KEY ("eventCompletionId") REFERENCES "EventCompletion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

