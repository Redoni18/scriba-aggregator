/*
  Warnings:

  - A unique constraint covering the columns `[sourceUniqueId]` on the table `Journalist` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Journalist_sourceUniqueId_key" ON "Journalist"("sourceUniqueId");
