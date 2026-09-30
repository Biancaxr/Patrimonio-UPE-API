import type { Asset, Inspection, Loan, Maintenance, Movement, Ticket } from './generated/prisma/client.js'

const assetStatus = {
  EM_USO: 'Em uso',
  DISPONIVEL: 'Disponível',
  EMPRESTADO: 'Emprestado',
  EM_MANUTENCAO: 'Em manutenção',
  DANIFICADO: 'Danificado',
  EXTRAVIADO: 'Extraviado',
  BAIXADO: 'Baixado',
} as const

const visibility = { PUBLICO: 'Público', INTERNO: 'Interno', RESTRITO: 'Restrito' } as const
const loanStatus = { EMPRESTADO: 'Emprestado', DEVOLVIDO: 'Devolvido', ATRASADO: 'Atrasado' } as const
const maintenanceStatus = {
  AGUARDANDO: 'Aguardando manutenção',
  EM_MANUTENCAO: 'Em manutenção',
  AGUARDANDO_PECA: 'Aguardando peça',
  CONCLUIDO: 'Concluído',
  SEM_REPARO: 'Sem possibilidade de reparo',
} as const
const ticketStatus = { NOVO: 'Novo', EM_TRIAGEM: 'Em triagem', EM_ATENDIMENTO: 'Em atendimento', RESOLVIDO: 'Resolvido' } as const
const ticketCategory = { EQUIPAMENTO_DANIFICADO: 'Equipamento danificado', FALHA_DE_SISTEMA: 'Falha de sistema', DUVIDA: 'Dúvida', OUTRO: 'Outro' } as const
const inspectionStatus = { AGENDADA: 'Agendada', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' } as const

export const presentAsset = (asset: Asset) => ({
  ...asset,
  status: assetStatus[asset.status],
  visibility: visibility[asset.visibility],
  updatedAt: asset.updatedAt.toISOString(),
  createdAt: asset.createdAt.toISOString(),
})

export const presentMovement = (item: Movement & { asset: Pick<Asset, 'code' | 'name'> }) => ({
  id: item.id,
  assetId: item.assetId,
  assetCode: item.asset.code,
  assetName: item.asset.name,
  from: item.from,
  to: item.to,
  previousResponsible: item.previousResponsible,
  newResponsible: item.newResponsible,
  reason: item.reason,
  user: item.performedByName,
  createdAt: item.createdAt.toISOString(),
})

export const presentLoan = (item: Loan & { asset: Pick<Asset, 'code' | 'name'> }) => ({
  ...item,
  assetCode: item.asset.code,
  assetName: item.asset.name,
  status: loanStatus[item.status],
  dueDate: item.dueDate.toISOString(),
  createdAt: item.createdAt.toISOString(),
  returnedAt: item.returnedAt?.toISOString() ?? null,
})

export const presentMaintenance = (item: Maintenance & { asset: Pick<Asset, 'code' | 'name'> }) => ({
  ...item,
  assetCode: item.asset.code,
  assetName: item.asset.name,
  status: maintenanceStatus[item.status],
  openedAt: item.openedAt.toISOString(),
  closedAt: item.closedAt?.toISOString() ?? null,
})

export const presentTicket = (item: Ticket & { asset: Pick<Asset, 'code' | 'name'> | null }) => ({
  ...item,
  assetCode: item.asset?.code,
  assetName: item.asset?.name,
  category: ticketCategory[item.category],
  status: ticketStatus[item.status],
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
})

export const presentInspection = (item: Inspection & { template: { name: string; location: string } }) => ({
  ...item,
  templateName: item.template.name,
  location: item.template.location,
  inspector: item.inspectorName,
  status: inspectionStatus[item.status],
  scheduledDate: item.scheduledDate.toISOString().slice(0, 10),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
})
