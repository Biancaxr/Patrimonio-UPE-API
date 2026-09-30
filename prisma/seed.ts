import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import Papa from 'papaparse'

import { AssetStatus, PrismaClient, UserRole, Visibility } from '../server/generated/prisma/client.js'


const ADMIN_SEED = {
  name: process.env.ADMIN_NAME?.trim() || '',
  email: process.env.ADMIN_EMAIL?.trim().toLowerCase() || '',
  password: process.env.ADMIN_PASSWORD || '',
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL não foi definida.')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
const here = path.dirname(fileURLToPath(import.meta.url))

const repair = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!/[ÃƒÃ‚Ã¢]/.test(text)) return text
  try {
    const bytes = Uint8Array.from([...text].map((character) => character.charCodeAt(0)))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return text
  }
}

const money = (value: unknown) => {
  const cleaned = repair(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

const statusOf = (value: unknown) => {
  const normalized = repair(value).toLocaleLowerCase('pt-BR')
  if (normalized.includes('manuten')) return AssetStatus.EM_MANUTENCAO
  if (normalized.includes('danif')) return AssetStatus.DANIFICADO
  if (normalized.includes('extravi')) return AssetStatus.EXTRAVIADO
  if (normalized.includes('baix')) return AssetStatus.BAIXADO
  if (normalized.includes('emprest')) return AssetStatus.EMPRESTADO
  if (normalized.includes('dispon')) return AssetStatus.DISPONIVEL
  return AssetStatus.EM_USO
}

const main = async () => {
  const csvPath = path.resolve(here, '../data/catalogo.csv')
  const csv = await readFile(csvPath, 'utf8')
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })

  if (parsed.errors.length) {
    console.warn(`O CSV apresentou ${parsed.errors.length} aviso(s); linhas válidas continuarão sendo importadas.`)
  }

  const seenCodes = new Map<string, number>()
  const assets = parsed.data.map((row, index) => {
    const fixed = Object.fromEntries(Object.entries(row).map(([key, value]) => [repair(key), repair(value)]))
    const rawSerial = fixed['Nº Série'] || fixed['N° Série'] || fixed['NÂº Série'] || `SEM-${index + 1}`
    const normalizedSerial = rawSerial.toLocaleLowerCase('pt-BR')
    const withoutPatrimony = normalizedSerial.includes('sem patrim') || normalizedSerial.includes('sem tombamento') || rawSerial === '-'
    const baseCode = withoutPatrimony ? `PAT-S/${String(index + 1).padStart(4, '0')}` : rawSerial
    const occurrence = (seenCodes.get(baseCode.toLocaleLowerCase('pt-BR')) ?? 0) + 1
    seenCodes.set(baseCode.toLocaleLowerCase('pt-BR'), occurrence)
    const code = occurrence === 1 ? baseCode : `${baseCode}/D${occurrence}`
    const model = fixed.Modelo && fixed.Modelo !== '-' ? fixed.Modelo : 'Não informado'

    return {
      id: `asset-${index + 1}`,
      code,
      name: fixed.Objeto || 'Item patrimonial',
      description: fixed.Observação && fixed.Observação !== '-' ? fixed.Observação : model,
      category: fixed.Categoria || 'Outros',
      brand: model.split(/\s+/)[0] || 'Não informada',
      model,
      serial: rawSerial,
      responsible: fixed.Responsável && fixed.Responsável !== '-' ? fixed.Responsável : 'Não atribuído',
      sector: fixed.Setor && fixed.Setor !== '-' ? fixed.Setor : 'Sem setor',
      room: fixed.Local && fixed.Local !== '-' ? fixed.Local : 'Sem localização',
      building: index % 3 === 0 ? 'Bloco A' : index % 3 === 1 ? 'Bloco B' : 'Bloco C',
      campus: 'Campus Caruaru',
      condition: fixed['Estado de conservação'] || 'Não informado',
      deliveryDate: fixed['Data de entrega'] || '-',
      status: statusOf(fixed.Status),
      invoice: fixed.NF || '-',
      value: money(fixed.Valor),
      notes: fixed.Observação || '',
      visibility: index % 8 === 0 ? Visibility.PUBLICO : index % 13 === 0 ? Visibility.RESTRITO : Visibility.INTERNO,
    }
  }).filter((asset) => asset.name && asset.name !== '-')

  const result = await prisma.asset.createMany({ data: assets, skipDuplicates: true })
  console.log(`${result.count} patrimônio(s) importado(s) de ${csvPath}.`)

  const locations = [...new Set(assets.map((asset) => `${asset.building} • ${asset.room}`))].slice(0, 30)
  const existingTemplates = await prisma.checklistTemplate.count()
  if (!existingTemplates) {
    await prisma.checklistTemplate.createMany({
      data: locations.map((location, index) => ({
        id: `template-${index + 1}`,
        name: 'Vistoria patrimonial',
        location,
        items: ['Conferir identificação patrimonial', 'Verificar estado de conservação', 'Confirmar localização e responsável'],
      })),
    })
    console.log(`${locations.length} modelo(s) de vistoria criado(s).`)
  }

  const adminIsFilled = Boolean(ADMIN_SEED.name && ADMIN_SEED.email && ADMIN_SEED.password.length >= 8)
  if (adminIsFilled) {
    const passwordHash = await bcrypt.hash(ADMIN_SEED.password, 12)
    await prisma.user.upsert({
      where: { email: ADMIN_SEED.email.toLowerCase() },
      update: { name: ADMIN_SEED.name, passwordHash, role: UserRole.ADMIN, active: true },
      create: { name: ADMIN_SEED.name, email: ADMIN_SEED.email.toLowerCase(), passwordHash, role: UserRole.ADMIN },
    })
    console.log(`Administrador ${ADMIN_SEED.email} criado/atualizado.`)
  } else {
    console.warn('Administrador não criado: defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (mínimo de 8 caracteres).')
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
