
# План: починить перенос колонки L в PO-выгрузке ФРДО

## Что сломано сейчас

Колонка **L** в PO-шаблоне — это `Наименование профессий рабочих, должностей служащих`.  
Сама функция `buildPORow()` пишет её корректно в **12-ю позицию**, а шаблонный инжектор переносит все непустые значения по индексам без сдвига. Значит проблема не в `frdoTemplateInjector.ts`, а в том, **что в row уже приходит пустой `professionName`**.

По коду видно расхождение:
- `BulkFRDOExport.tsx` уже использует `resolveFRDOFields(...)` и передаёт `resolved.professionName`
- но `useFRDOManager.ts` и `FRDOExportDialog.tsx` всё ещё собирают PO-строку по старой схеме:
  - `professionName: data.profession_name || courseSettings?.frdo_profession_name || ""`
  - без единого общего резолвера
  - без безопасного fallback
  - без явного предупреждения, если поле осталось пустым

Из-за этого в одном сценарии L заполняется, а в другом — снова пустая.

## Что сделаю

### 1. Приведу все PO/DPO-экспорты к одному резолверу
Во всех местах, где строятся строки ФРДО, использовать один и тот же helper:
- `resolveFRDOFields(frdoData, courseSettings)`

Это исправит единообразно:
- `professionName` для PO
- `gender`
- `trainingForm`
- `financingSource`
- `educationForm`
- DPO-поля курса

## 2. Починю конкретно массовую кнопочную выгрузку в FRDO Manager
В `src/hooks/useFRDOManager.ts` заменю старую ручную сборку на:
- `const resolved = resolveFRDOFields(data, courseSettings)`
- для PO:
  - `professionName: resolved.professionName`
  - `qualificationRank: resolved.qualificationRank`
  - `gender: resolved.gender`
  - остальные поля тоже через resolved где нужно
- для DPO:
  - `professionalArea`, `specialtyGroup`, `qualificationName`, `gender` и прочее — тоже через resolved

Это самый вероятный источник текущей ошибки с L.

## 3. Починю одиночный экспорт из карточки ученика
В `src/components/organization/FRDOExportDialog.tsx` уберу локальную разрозненную логику:
- вместо `frдоData.profession_name || courseData?.frdo_profession_name || ""`
- использовать `resolveFRDOFields(frдоData, courseData)`

Для PO-экспорта:
- `professionName: resolved.professionName`
- `qualificationRank: resolved.qualificationRank`
- `gender: resolved.gender`

Для DPO:
- аналогично перейти на `resolved.*`

Так одиночный и массовый экспорт будут выдавать одинаковый результат.

## 4. Добавлю жёсткую защиту от пустой L
Если экспорт типа `po` и после всех fallback поле `resolved.professionName` всё ещё пустое:
- не экспортировать молча пустую колонку L
- показать понятную ошибку:
  - `Не заполнено "Наименование профессии" для курса/ученика. Укажите frdo_profession_name в курсе или profession_name у ученика.`

Это лучше, чем снова отдавать битый файл.

## 5. Добавлю тест именно на колонку L
Расширю тесты в `src/utils/__tests__/frdoExcelExport.test.ts` или добавлю отдельный тест на резолвер:
- PO row должен класть `professionName` в индекс `11` (Excel L)
- если `student.profession_name` пусто, а `course.frdo_profession_name = "Охранник"`, то в row[11] должно быть `"Охранник"`

Отдельно добавлю тест на fallback через `resolveFRDOFields`.

## Файлы

| Файл | Что изменить |
|---|---|
| `src/hooks/useFRDOManager.ts` | перевести сборку DPO/PO строк на `resolveFRDOFields()` |
| `src/components/organization/FRDOExportDialog.tsx` | использовать `resolveFRDOFields()` для одиночного экспорта |
| `src/utils/frdoFieldResolver.ts` | при необходимости усилить fallback и оставить единый источник правды |
| `src/utils/__tests__/frdoExcelExport.test.ts` | тест на L-колонку / profession fallback |

## Ожидаемый результат

После исправления:
- в PO-выгрузке колонка **L** будет заполняться значением профессии, например **«Охранник»**
- это будет работать одинаково:
  - в массовой выгрузке
  - в одиночной карточке ученика
  - при экспорте через менеджер ФРДО
- если профессия не задана вообще нигде, система остановит экспорт с понятной ошибкой, а не создаст файл с пустой L
