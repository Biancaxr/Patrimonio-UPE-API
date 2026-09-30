import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { z } from 'zod'

import { allow, createToken, requireAuth } from './auth.js'
import { prisma } from './db.js'
import {
  AssetStatus,
  InspectionStatus,
  LoanStatus,
  MaintenanceStatus,
  TicketCategory,
  TicketStatus,
  UserRole,
  Visibility,
} from './generated/prisma/client.js'
import type { Prisma } from './generated/prisma/client.js'
import { presentAsset, presentInspection, presentLoan, presentMaintenance, presentMovement, presentTicket } from './presenters.js'

const app = express()
const port = Number(process.env.PORT || 3333)
const origins = (process.env.WEB_ORIGIN || 'http://localhost:5173').split(',').map((item) => item.trim())

app.use(helmet())
app.use(cors({ origin: origins, credentials: false }))
app.use(express.json({ limit: '2mb' }))

const asyncRoute = (handler: (request: Request, response: Response) => Promise<unknown>) =>
  (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next)
  }

const routeParam = (value: string | string[]) => Array.isArray(value) ? value[0] : value

const assetStatusInput: Record<string, AssetStatus> = {
  'Em uso': AssetStatus.EM_USO,
  'Disponível': AssetStatus.DISPONIVEL,
  Emprestado: AssetStatus.EMPRESTADO,
  'Em manutenção': AssetStatus.EM_MANUTENCAO,
  Danificado: AssetStatus.DANIFICADO,
  Extraviado: AssetStatus.EXTRAVIADO,
  Baixado: AssetStatus.BAIXADO,
}
const visibilityInput: Record<string, Visibility> = { Público: Visibility.PUBLICO, Interno: Visibility.INTERNO, Restrito: Visibility.RESTRITO }
const loanStatusInput: Record<string, LoanStatus> = { Emprestado: LoanStatus.EMPRESTADO, Devolvido: LoanStatus.DEVOLVIDO, Atrasado: LoanStatus.ATRASADO }
const maintenanceStatusInput: Record<string, MaintenanceStatus> = {
  'Aguardando manutenção': MaintenanceStatus.AGUARDANDO,
  'Em manutenção': MaintenanceStatus.EM_MANUTENCAO,
  'Aguardando peça': MaintenanceStatus.AGUARDANDO_PECA,
  Concluído: MaintenanceStatus.CONCLUIDO,
  'Sem possibilidade de reparo': MaintenanceStatus.SEM_REPARO,
}
const ticketStatusInput: Record<string, TicketStatus> = { Novo: TicketStatus.NOVO, 'Em triagem': TicketStatus.EM_TRIAGEM, 'Em atendimento': TicketStatus.EM_ATENDIMENTO, Resolvido: TicketStatus.RESOLVIDO }
const ticketCategoryInput: Record<string, TicketCategory> = { 'Equipamento danificado': TicketCategory.EQUIPAMENTO_DANIFICADO, 'Falha de sistema': TicketCategory.FALHA_DE_SISTEMA, Dúvida: TicketCategory.DUVIDA, Outro: TicketCategory.OUTRO }
const inspectionStatusInput: Record<string, InspectionStatus> = { Agendada: InspectionStatus.AGENDADA, 'Em andamento': InspectionStatus.EM_ANDAMENTO, Concluída: InspectionStatus.CONCLUIDA }

const electronicAssetWhere: Prisma.AssetWhereInput = {
  AND: [
    {
      OR: ['informática'].map((term) => ({
        category: { contains: term, mode: 'insensitive' as const },
      })),
    },
    {
      NOT: {
        OR: ['móveis', 'moveis', 'utensílios', 'utensilios', 'jogos', 'diversão', 'diversao', 'suporte', 'mastro'].map((term) => ({
          category: { contains: term, mode: 'insensitive' as const },
        })),
      },
    },
  ],
}

const assetAccessWhere = (role?: UserRole): Prisma.AssetWhereInput => role === UserRole.TI ? electronicAssetWhere : {}

const assetBody = z.object({
  code: z.string().trim().min(1), name: z.string().trim().min(1), description: z.string().default(''),
  category: z.string().min(1), brand: z.string().default('Não informada'), model: z.string().default('Não informado'),
  serial: z.string().default('-'), responsible: z.string().default('Não atribuído'), sector: z.string().default('Sem setor'),
  room: z.string().default('Sem localização'), building: z.string().default('Não informado'), campus: z.string().default('Campus Caruaru'),
  condition: z.string().default('Não informado'), deliveryDate: z.string().default('-'), status: z.string().default('Em uso'),
  invoice: z.string().default('-'), value: z.coerce.number().default(0), notes: z.string().default(''), visibility: z.string().default('Interno'),
})

const toAssetData = (body: z.infer<typeof assetBody>) => ({
  ...body,
  status: assetStatusInput[body.status] ?? AssetStatus.EM_USO,
  visibility: visibilityInput[body.visibility] ?? Visibility.INTERNO,
})

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body)
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } })
  if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return response.status(401).json({ message: 'E-mail ou senha inválidos.' })
  }
  const sessionUser = { id: user.id, name: user.name, email: user.email, role: user.role }
  return response.json({ token: createToken(sessionUser), user: sessionUser })
}))

app.get('/api/auth/me', requireAuth, asyncRoute(async (request, response) => {
  const user = await prisma.user.findUnique({ where: { id: request.user!.id }, select: { id: true, name: true, email: true, role: true, active: true } })
  return user?.active ? response.json(user) : response.status(401).json({ message: 'Usuário inativo.' })
}))

app.get('/api/public/stats', asyncRoute(async (_request, response) => {
  const [totalAssets, publicAssets] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.count({ where: { visibility: Visibility.PUBLICO } }),
  ])
  response.json({ totalAssets, publicAssets })
}))

app.get('/api/public/assets', asyncRoute(async (request, response) => {
  const query = String(request.query.q || '').trim()
  if (query.length < 2) return response.json([])

  const assets = await prisma.asset.findMany({
    where: {
      visibility: Visibility.PUBLICO,
      OR: [
        { code: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { name: 'asc' },
    take: 6,
  })
  response.json(assets.map(presentAsset))
}))

app.get('/api/public/assets/:code', asyncRoute(async (request, response) => {
  const asset = await prisma.asset.findFirst({ where: { code: routeParam(request.params.code), visibility: Visibility.PUBLICO } })
  return asset ? response.json(presentAsset(asset)) : response.status(404).json({ message: 'Patrimônio público não encontrado.' })
}))

app.post('/api/public/tickets', asyncRoute(async (request, response) => {
  const input = z.object({ assetId: z.string().optional(), requester: z.string().min(2), contact: z.string().min(2), location: z.string().min(1), category: z.string(), description: z.string().min(5), audience: z.array(z.string()).default(['Administrativo']) }).parse(request.body)
  const ticket = await prisma.ticket.create({ data: { ...input, category: ticketCategoryInput[input.category] ?? TicketCategory.OUTRO }, include: { asset: { select: { code: true, name: true } } } })
  return response.status(201).json(presentTicket(ticket))
}))

app.use('/api', requireAuth)

app.get('/api/dashboard', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (_request, response) => {
  const [assets, activeLoans, maintenances, openTickets] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'], _count: true }),
    prisma.loan.count({ where: { status: LoanStatus.EMPRESTADO } }),
    prisma.maintenance.count({ where: { status: { not: MaintenanceStatus.CONCLUIDO } } }),
    prisma.ticket.count({ where: { status: { not: TicketStatus.RESOLVIDO } } }),
  ])
  response.json({ assets, activeLoans, maintenances, openTickets })
}))

app.get('/api/assets', asyncRoute(async (request, response) => {
  const query = String(request.query.q || '').trim()
  const filters: Prisma.AssetWhereInput[] = [assetAccessWhere(request.user?.role)]
  if (query) filters.push({ OR: [{ code: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }, { serial: { contains: query, mode: 'insensitive' } }] })
  const assets = await prisma.asset.findMany({
    where: { AND: filters },
    orderBy: { name: 'asc' },
  })
  response.json(assets.map(presentAsset))
}))

app.get('/api/assets/:idOrCode', asyncRoute(async (request, response) => {
  const value = routeParam(request.params.idOrCode)
  const asset = await prisma.asset.findFirst({ where: { AND: [assetAccessWhere(request.user?.role), { OR: [{ id: value }, { code: value }, { serial: value }] }] } })
  return asset ? response.json(presentAsset(asset)) : response.status(404).json({ message: 'Patrimônio não encontrado.' })
}))

app.post('/api/assets', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const asset = await prisma.asset.create({ data: toAssetData(assetBody.parse(request.body)) })
  await prisma.auditLog.create({ data: { userId: request.user!.id, action: 'CREATE', entity: 'Asset', entityId: asset.id } })
  response.status(201).json(presentAsset(asset))
}))

app.patch('/api/assets/:id', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = assetBody.partial().parse(request.body)
  const data = { ...input } as Record<string, unknown>
  if (input.status) data.status = assetStatusInput[input.status] ?? input.status
  if (input.visibility) data.visibility = visibilityInput[input.visibility] ?? input.visibility
  const asset = await prisma.asset.update({ where: { id: routeParam(request.params.id) }, data })
  await prisma.auditLog.create({ data: { userId: request.user!.id, action: 'UPDATE', entity: 'Asset', entityId: asset.id } })
  response.json(presentAsset(asset))
}))

app.post('/api/assets/:id/transfer', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = z.object({ room: z.string().min(1), sector: z.string().min(1), responsible: z.string().min(1), reason: z.string().min(1) }).parse(request.body)
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: routeParam(request.params.id) } })
  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.movement.create({ data: { assetId: asset.id, from: asset.room, to: input.room, previousResponsible: asset.responsible, newResponsible: input.responsible, reason: input.reason, performedById: request.user!.id, performedByName: request.user!.name }, include: { asset: { select: { code: true, name: true } } } })
    await tx.asset.update({ where: { id: asset.id }, data: { room: input.room, sector: input.sector, responsible: input.responsible } })
    return created
  })
  response.status(201).json(presentMovement(movement))
}))

app.get('/api/movements', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (_request, response) => {
  const items = await prisma.movement.findMany({ include: { asset: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' } })
  response.json(items.map(presentMovement))
}))

app.get('/api/loans', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (_request, response) => {
  const items = await prisma.loan.findMany({ include: { asset: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' } })
  response.json(items.map(presentLoan))
}))

app.post('/api/loans', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = z.object({ assetId: z.string(), requester: z.string().min(2), dueDate: z.coerce.date() }).parse(request.body)
  const item = await prisma.$transaction(async (tx) => {
    await tx.asset.update({ where: { id: input.assetId }, data: { status: AssetStatus.EMPRESTADO } })
    return tx.loan.create({ data: input, include: { asset: { select: { code: true, name: true } } } })
  })
  response.status(201).json(presentLoan(item))
}))

app.patch('/api/loans/:id', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = z.object({ status: z.string() }).parse(request.body)
  const current = await prisma.loan.findUniqueOrThrow({ where: { id: routeParam(request.params.id) } })
  const status = loanStatusInput[input.status] ?? LoanStatus.DEVOLVIDO
  const item = await prisma.$transaction(async (tx) => {
    if (status === LoanStatus.DEVOLVIDO) await tx.asset.update({ where: { id: current.assetId }, data: { status: AssetStatus.DISPONIVEL } })
    return tx.loan.update({ where: { id: current.id }, data: { status, returnedAt: status === LoanStatus.DEVOLVIDO ? new Date() : null }, include: { asset: { select: { code: true, name: true } } } })
  })
  response.json(presentLoan(item))
}))

app.get('/api/maintenances', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (_request, response) => {
  const items = await prisma.maintenance.findMany({ include: { asset: { select: { code: true, name: true } } }, orderBy: { openedAt: 'desc' } })
  response.json(items.map(presentMaintenance))
}))

app.post('/api/maintenances', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = z.object({ assetId: z.string(), issue: z.string().min(3), technician: z.string().default('Não atribuído') }).parse(request.body)
  const item = await prisma.$transaction(async (tx) => {
    await tx.asset.update({ where: { id: input.assetId }, data: { status: AssetStatus.EM_MANUTENCAO } })
    return tx.maintenance.create({ data: input, include: { asset: { select: { code: true, name: true } } } })
  })
  response.status(201).json(presentMaintenance(item))
}))

app.patch('/api/maintenances/:id', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = z.object({ status: z.string().optional(), technician: z.string().optional(), cost: z.coerce.number().optional() }).parse(request.body)
  const current = await prisma.maintenance.findUniqueOrThrow({ where: { id: routeParam(request.params.id) } })
  const status = input.status ? (maintenanceStatusInput[input.status] ?? current.status) : current.status
  const item = await prisma.$transaction(async (tx) => {
    if (status === MaintenanceStatus.CONCLUIDO) await tx.asset.update({ where: { id: current.assetId }, data: { status: AssetStatus.DISPONIVEL } })
    return tx.maintenance.update({ where: { id: current.id }, data: { ...input, status, closedAt: status === MaintenanceStatus.CONCLUIDO ? new Date() : null }, include: { asset: { select: { code: true, name: true } } } })
  })
  response.json(presentMaintenance(item))
}))

app.get('/api/checklist-templates', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.ALUNO), asyncRoute(async (_request, response) => {
  response.json(await prisma.checklistTemplate.findMany({ where: { active: true }, orderBy: { location: 'asc' } }))
}))

app.post('/api/checklist-templates', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO), asyncRoute(async (request, response) => {
  const input = z.object({ name: z.string().min(2), location: z.string().min(1), items: z.array(z.string()).min(1) }).parse(request.body)
  response.status(201).json(await prisma.checklistTemplate.create({ data: input }))
}))

app.get('/api/inspections', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.ALUNO), asyncRoute(async (_request, response) => {
  const items = await prisma.inspection.findMany({ include: { template: { select: { name: true, location: true } } }, orderBy: { scheduledDate: 'desc' } })
  response.json(items.map(presentInspection))
}))

app.post('/api/inspections', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.ALUNO), asyncRoute(async (request, response) => {
  const input = z.object({ templateId: z.string(), scheduledDate: z.coerce.date(), notes: z.string().default(''), completedItems: z.array(z.string()).default([]), totalItems: z.number().int().nonnegative(), status: z.string().default('Agendada') }).parse(request.body)
  if (input.scheduledDate.getDay() === 0 || input.scheduledDate.getDay() === 6) {
    return response.status(400).json({ message: 'Os checklists só podem ser agendados de segunda a sexta-feira.' })
  }
  const item = await prisma.inspection.create({ data: { ...input, status: inspectionStatusInput[input.status] ?? InspectionStatus.AGENDADA, inspectorId: request.user!.id, inspectorName: request.user!.name }, include: { template: { select: { name: true, location: true } } } })
  response.status(201).json(presentInspection(item))
}))

app.patch('/api/inspections/:id', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.ALUNO), asyncRoute(async (request, response) => {
  const input = z.object({ notes: z.string().optional(), completedItems: z.array(z.string()).optional(), status: z.string().optional() }).parse(request.body)
  const data = { ...input } as Record<string, unknown>
  if (input.status) data.status = inspectionStatusInput[input.status] ?? input.status
  const id = routeParam(request.params.id)
  await prisma.inspection.update({ where: { id }, data })
  const item = await prisma.inspection.findUniqueOrThrow({ where: { id }, include: { template: { select: { name: true, location: true } } } })
  response.json(presentInspection(item))
}))

app.get('/api/tickets', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.TI), asyncRoute(async (_request, response) => {
  const items = await prisma.ticket.findMany({ include: { asset: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' } })
  response.json(items.map(presentTicket))
}))

app.patch('/api/tickets/:id', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.TI), asyncRoute(async (request, response) => {
  const input = z.object({ status: z.string() }).parse(request.body)
  const id = routeParam(request.params.id)
  await prisma.ticket.update({ where: { id }, data: { status: ticketStatusInput[input.status] ?? TicketStatus.NOVO } })
  const item = await prisma.ticket.findUniqueOrThrow({ where: { id }, include: { asset: { select: { code: true, name: true } } } })
  response.json(presentTicket(item))
}))

app.get('/api/inventory-sessions', asyncRoute(async (_request, response) => {
  response.json(await prisma.inventorySession.findMany({ include: { _count: { select: { scans: true } } }, orderBy: { startedAt: 'desc' } }))
}))

app.post('/api/inventory-sessions', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.TI), asyncRoute(async (request, response) => {
  const input = z.object({ name: z.string().min(2), location: z.string().min(1) }).parse(request.body)
  response.status(201).json(await prisma.inventorySession.create({ data: { ...input, startedById: request.user!.id } }))
}))

app.post('/api/inventory-sessions/:id/scans', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.TI), asyncRoute(async (request, response) => {
  const input = z.object({ code: z.string().min(1) }).parse(request.body)
  const asset = await prisma.asset.findFirst({ where: { OR: [{ code: input.code }, { serial: input.code }] } })
  if (!asset) return response.status(404).json({ message: 'Código não localizado no catálogo.' })
  const sessionId = routeParam(request.params.id)
  const saved = await prisma.inventoryScan.upsert({ where: { sessionId_assetId: { sessionId, assetId: asset.id } }, update: { scannedAt: new Date() }, create: { sessionId, assetId: asset.id } })
  const scan = await prisma.inventoryScan.findUniqueOrThrow({ where: { id: saved.id }, include: { asset: true } })
  return response.status(201).json({ ...scan, asset: presentAsset(scan.asset) })
}))

app.patch('/api/inventory-sessions/:id/finish', allow(UserRole.ADMIN, UserRole.ADMINISTRACAO, UserRole.TI), asyncRoute(async (request, response) => {
  response.json(await prisma.inventorySession.update({ where: { id: routeParam(request.params.id) }, data: { finishedAt: new Date() } }))
}))

app.get('/api/users', allow(UserRole.ADMIN), asyncRoute(async (_request, response) => {
  response.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }, orderBy: { name: 'asc' } }))
}))

app.post('/api/users', allow(UserRole.ADMIN), asyncRoute(async (request, response) => {
  const input = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.nativeEnum(UserRole) }).parse(request.body)
  const passwordHash = await bcrypt.hash(input.password, 12)
  const user = await prisma.user.create({ data: { name: input.name, email: input.email.toLowerCase(), passwordHash, role: input.role, createdById: request.user!.id }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } })
  response.status(201).json(user)
}))

app.patch('/api/users/:id', allow(UserRole.ADMIN), asyncRoute(async (request, response) => {
  const input = z.object({ name: z.string().min(2).optional(), role: z.nativeEnum(UserRole).optional(), active: z.boolean().optional(), password: z.string().min(8).optional() }).parse(request.body)
  const { password, ...data } = input
  const user = await prisma.user.update({ where: { id: routeParam(request.params.id) }, data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } })
  response.json(user)
}))

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return response.status(400).json({ message: 'Dados inválidos.', issues: error.issues })
  const message = error instanceof Error ? error.message : 'Erro interno.'
  console.error(error)
  return response.status(500).json({ message })
})

const server = app.listen(port, '0.0.0.0', () => console.log(`API Patrimônio UPE em http://localhost:${port}/api`))

const shutdown = async () => {
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
