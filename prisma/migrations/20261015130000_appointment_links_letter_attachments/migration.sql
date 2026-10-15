-- CreateTable
CREATE TABLE "_LetterAttachments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LetterAttachments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AppointmentToPerson" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AppointmentToPerson_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AppointmentToDocument" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AppointmentToDocument_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_LetterAttachments_B_index" ON "_LetterAttachments"("B");

-- CreateIndex
CREATE INDEX "_AppointmentToPerson_B_index" ON "_AppointmentToPerson"("B");

-- CreateIndex
CREATE INDEX "_AppointmentToDocument_B_index" ON "_AppointmentToDocument"("B");

-- AddForeignKey
ALTER TABLE "_LetterAttachments" ADD CONSTRAINT "_LetterAttachments_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LetterAttachments" ADD CONSTRAINT "_LetterAttachments_B_fkey" FOREIGN KEY ("B") REFERENCES "Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentToPerson" ADD CONSTRAINT "_AppointmentToPerson_A_fkey" FOREIGN KEY ("A") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentToPerson" ADD CONSTRAINT "_AppointmentToPerson_B_fkey" FOREIGN KEY ("B") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentToDocument" ADD CONSTRAINT "_AppointmentToDocument_A_fkey" FOREIGN KEY ("A") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentToDocument" ADD CONSTRAINT "_AppointmentToDocument_B_fkey" FOREIGN KEY ("B") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

