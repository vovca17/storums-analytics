import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

type Cat = { key: string; name: string; type: TransactionType; icon?: string; children?: Cat[] };

/** Системные статьи (ownerId = null). Пользователь добавляет свои поверх этих. */
const SYSTEM_CATEGORIES: Cat[] = [
  { key: 'rent', name: 'Арендная плата', type: 'INCOME', icon: 'home' },
  { key: 'daily_rent', name: 'Посуточная аренда', type: 'INCOME', icon: 'calendar' },
  { key: 'utilities_compensation', name: 'Компенсация ЖКХ', type: 'INCOME', icon: 'receipt' },
  { key: 'deposit_kept', name: 'Удержанный залог', type: 'INCOME', icon: 'shield' },
  { key: 'other_income', name: 'Прочие доходы', type: 'INCOME', icon: 'plus' },
  { key: 'utilities', name: 'ЖКХ', type: 'EXPENSE', icon: 'receipt' },
  { key: 'internet', name: 'Интернет и ТВ', type: 'EXPENSE', icon: 'wifi' },
  { key: 'repair', name: 'Ремонт', type: 'EXPENSE', icon: 'hammer' },
  { key: 'furniture', name: 'Мебель и техника', type: 'EXPENSE', icon: 'sofa' },
  { key: 'cleaning', name: 'Уборка', type: 'EXPENSE', icon: 'sparkles' },
  { key: 'mortgage', name: 'Ипотека', type: 'EXPENSE', icon: 'bank' },
  { key: 'insurance', name: 'Страхование', type: 'EXPENSE', icon: 'umbrella' },
  { key: 'property_tax', name: 'Налог на имущество', type: 'EXPENSE', icon: 'landmark' },
  { key: 'rental_tax', name: 'Налог с аренды', type: 'EXPENSE', icon: 'percent' },
  { key: 'agent_fee', name: 'Комиссия агента', type: 'EXPENSE', icon: 'handshake' },
  { key: 'platform_fee', name: 'Комиссия площадки', type: 'EXPENSE', icon: 'percent' },
  { key: 'other_expense', name: 'Прочие расходы', type: 'EXPENSE', icon: 'minus' },
];

async function upsertCategory(c: Cat, parentId: string | null) {
  const row = await prisma.category.upsert({
    where: { systemKey: c.key },
    update: { name: c.name, icon: c.icon, parentId },
    create: { systemKey: c.key, name: c.name, type: c.type, icon: c.icon, parentId },
  });
  for (const child of c.children ?? []) await upsertCategory(child, row.id);
}

async function main() {
  for (const c of SYSTEM_CATEGORIES) await upsertCategory(c, null);
  // Региональные тарифы: prisma/tariffs/*.json по постановлениям тарифных комитетов (заполняются вручную).
  console.log('Seed: системные статьи готовы');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
