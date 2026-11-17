-- Подстатьи ЖКХ сливаются в «ЖКХ». Только данные, схема не меняется.
-- Порядок важен: у Category.parentId каскадное удаление и RESTRICT у Transaction.categoryId,
-- поэтому сначала перевешиваем дочерние статьи пользователей и операции на «ЖКХ», потом удаляем подстатьи.
-- Если «ЖКХ» в базе нет (чистая база до seed), ничего не происходит.

-- 1. Дочерние статьи пользователей: родитель «Вода» и т.п. → «ЖКХ»
UPDATE "Category"
SET "parentId" = (SELECT id FROM "Category" WHERE "systemKey" = 'utilities')
WHERE "parentId" IN (SELECT id FROM "Category" WHERE "systemKey" IN
        ('utilities_water','utilities_electricity','utilities_gas','utilities_heat',
         'utilities_maintenance','utilities_capital_repair','utilities_waste'))
  AND EXISTS (SELECT 1 FROM "Category" WHERE "systemKey" = 'utilities');

-- 2. Операции по подстатьям → «ЖКХ»
UPDATE "Transaction"
SET "categoryId" = (SELECT id FROM "Category" WHERE "systemKey" = 'utilities')
WHERE "categoryId" IN (SELECT id FROM "Category" WHERE "systemKey" IN
        ('utilities_water','utilities_electricity','utilities_gas','utilities_heat',
         'utilities_maintenance','utilities_capital_repair','utilities_waste'))
  AND EXISTS (SELECT 1 FROM "Category" WHERE "systemKey" = 'utilities');

-- 3. Удаление подстатей — только если «ЖКХ» есть, иначе ссылки не перевешены
DELETE FROM "Category"
WHERE "systemKey" IN
        ('utilities_water','utilities_electricity','utilities_gas','utilities_heat',
         'utilities_maintenance','utilities_capital_repair','utilities_waste')
  AND EXISTS (SELECT 1 FROM "Category" WHERE "systemKey" = 'utilities');
