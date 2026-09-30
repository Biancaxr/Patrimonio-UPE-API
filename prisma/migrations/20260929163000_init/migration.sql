CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserRole" AS ENUM ('ALUNO', 'TI', 'ADMINISTRACAO', 'ADMIN');
CREATE TYPE "AssetStatus" AS ENUM ('EM_USO', 'DISPONIVEL', 'EMPRESTADO', 'EM_MANUTENCAO', 'DANIFICADO', 'EXTRAVIADO', 'BAIXADO');
CREATE TYPE "Visibility" AS ENUM ('PUBLICO', 'INTERNO', 'RESTRITO');
CREATE TYPE "LoanStatus" AS ENUM ('EMPRESTADO', 'DEVOLVIDO', 'ATRASADO');
CREATE TYPE "MaintenanceStatus" AS ENUM ('AGUARDANDO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'CONCLUIDO', 'SEM_REPARO');
CREATE TYPE "TicketStatus" AS ENUM ('NOVO', 'EM_TRIAGEM', 'EM_ATENDIMENTO', 'RESOLVIDO');
CREATE TYPE "TicketCategory" AS ENUM ('EQUIPAMENTO_DANIFICADO', 'FALHA_DE_SISTEMA', 'DUVIDA', 'OUTRO');
CREATE TYPE "InspectionStatus" AS ENUM ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL, "brand" TEXT NOT NULL, "model" TEXT NOT NULL, "serial" TEXT NOT NULL,
  "responsible" TEXT NOT NULL, "sector" TEXT NOT NULL, "room" TEXT NOT NULL, "building" TEXT NOT NULL,
  "campus" TEXT NOT NULL, "condition" TEXT NOT NULL, "deliveryDate" TEXT NOT NULL,
  "status" "AssetStatus" NOT NULL DEFAULT 'EM_USO', "invoice" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0, "notes" TEXT NOT NULL DEFAULT '',
  "visibility" "Visibility" NOT NULL DEFAULT 'INTERNO', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Movement" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "from" TEXT NOT NULL, "to" TEXT NOT NULL,
  "previousResponsible" TEXT NOT NULL, "newResponsible" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "performedById" TEXT, "performedByName" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Loan" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "requester" TEXT NOT NULL, "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "LoanStatus" NOT NULL DEFAULT 'EMPRESTADO', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3), CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Maintenance" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "issue" TEXT NOT NULL,
  "technician" TEXT NOT NULL DEFAULT 'Não atribuído', "status" "MaintenanceStatus" NOT NULL DEFAULT 'AGUARDANDO',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
  "cost" DOUBLE PRECISION NOT NULL DEFAULT 0, CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL, "assetId" TEXT, "requester" TEXT NOT NULL, "contact" TEXT NOT NULL,
  "location" TEXT NOT NULL, "category" "TicketCategory" NOT NULL, "description" TEXT NOT NULL,
  "audience" JSONB NOT NULL, "status" "TicketStatus" NOT NULL DEFAULT 'NOVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChecklistTemplate" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "location" TEXT NOT NULL, "items" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Inspection" (
  "id" TEXT NOT NULL, "templateId" TEXT NOT NULL, "inspectorId" TEXT, "inspectorName" TEXT NOT NULL,
  "scheduledDate" TIMESTAMP(3) NOT NULL, "notes" TEXT NOT NULL DEFAULT '', "completedItems" JSONB NOT NULL,
  "totalItems" INTEGER NOT NULL, "status" "InspectionStatus" NOT NULL DEFAULT 'AGENDADA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySession" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "location" TEXT NOT NULL, "startedById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  CONSTRAINT "InventorySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryScan" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL, "userId" TEXT, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");
CREATE INDEX "Asset_name_idx" ON "Asset"("name");
CREATE INDEX "Asset_category_idx" ON "Asset"("category");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Asset_building_room_idx" ON "Asset"("building", "room");
CREATE INDEX "Movement_assetId_createdAt_idx" ON "Movement"("assetId", "createdAt");
CREATE INDEX "Loan_status_dueDate_idx" ON "Loan"("status", "dueDate");
CREATE INDEX "Maintenance_status_openedAt_idx" ON "Maintenance"("status", "openedAt");
CREATE INDEX "Ticket_status_createdAt_idx" ON "Ticket"("status", "createdAt");
CREATE INDEX "Inspection_scheduledDate_status_idx" ON "Inspection"("scheduledDate", "status");
CREATE UNIQUE INDEX "InventoryScan_sessionId_assetId_key" ON "InventoryScan"("sessionId", "assetId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryScan" ADD CONSTRAINT "InventoryScan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryScan" ADD CONSTRAINT "InventoryScan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
