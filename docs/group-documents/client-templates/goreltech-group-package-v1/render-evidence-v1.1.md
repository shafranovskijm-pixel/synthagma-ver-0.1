# Render evidence: ГОРЭЛТЕХ v1.1

Дата проверки: 24.08.2026 (Asia/Vladivostok). Контрольный комплект сформирован из шаблонов коммита `70f42087cac84694460372356095c6f00c2b29d7`. Последующий integrity follow-up не меняет геометрию или содержимое `template.docx`.

## Файлы проверки

- 9 заполненных QA DOCX: `C:\Temp\synthagma-goreltech-v11-compiled-docx-20260823`
- 9 PDF: `C:\Temp\synthagma-goreltech-v11-compiled-render-20260823`
- 10 PNG страниц: одноимённые подпапки в `C:\Temp\synthagma-goreltech-v11-compiled-render-20260823`

Это локальные QA-файлы, не production-вложения. Они сохранены для review и не включаются в Edge bundle.

## Способ рендера

PDF экспортирован установленным Microsoft Word 16.0 через `ExportAsFixedFormat` (`17` = PDF):

```powershell
$input = 'C:\Temp\synthagma-goreltech-v11-compiled-docx-20260823'
$output = 'C:\Temp\synthagma-goreltech-v11-compiled-render-20260823'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($file in (Get-ChildItem -LiteralPath $input -Filter '*.docx' | Sort-Object Name)) {
    $pdf = Join-Path $output ($file.BaseName + '.pdf')
    $document = $word.Documents.Open($file.FullName, $false, $true, $false)
    try { $document.ExportAsFixedFormat($pdf, 17) }
    finally {
      $document.Close(0)
      [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
    }
  }
} finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
```

PNG получены из этих PDF с PyMuPDF 1.28.2, масштаб `Matrix(1.5, 1.5)`, `alpha=False`. Визуальная проверка выполнялась по PNG в исходном разрешении.

## SHA-256 контрольного комплекта

| Документ | QA DOCX SHA-256 | PDF SHA-256 |
|---|---|---|
| `attestation_sheet` | `9F60E8B540FE6025CC44CAD5F8EBAFFCEC2954AA6D526B9D5ABFD7BF3480E9BD` | `8AE4261A57642D77DDA30B3A77C2E0925AD0B5C9540EBC2BD4242C9DA68A48D2` |
| `class_journal` | `3466BB42109CA9070B23F7926B965DCA3CA4B589A2CD9CE94B9D965F5675FA91` | `4373A8E9B6176E0891628EFC68AB5A9E98AAE02FE08D370E7789CCEDEBF08691` |
| `enrollment_order` | `BE40FDDE9A20DAC156D515E81747764535322A06870A9E71497CB45BD9AB441B` | `06E737A782452B35BA799DE5BC2D88F9D4E54CEA620794BA3009A3BF200DB6BD` |
| `expulsion_order` | `8615C6F3FFE4F8A21B23738DEC8AE2A9070752A44D663B9FBE899E4990F8C334` | `2EA7C925AFF7E883669A26C807C444F720F535A673B9DA8EC074B04710282A32` |
| `pass` | `F96639C8F38DFE0348291FF594473B9C3BD727D44912B5E7E1FF5503A2C54723` | `79A529116F3A79E9157A98406907E679A3C5C8871CEE435D04884C3F09715900` |
| `registration_book` | `18A2E65FDE292EFE7CD6BE18FBCBF7A15544395210D51A83EF525F5143FC9E70` | `017C871A135404A737306AFCE04D17052AB805A9BD2767D7FB4A7CE71F8C3B96` |
| `schedule` | `2F15EF7D01CB38C268A87DF418E030C1A2B42DAF6A775E98A428F6FE87EC771E` | `7BF18DA23F4F1378BB147786801411F6B416533F7D33A472270E3C3E9A242711` |
| `student_list` | `65F49C6A3D4A668B0E17A134B9B03AB677BC008B2A50B0E8B780E5985291B3BF` | `0F69B7B5B1497D6EAA9ED839B142D6543C7DE15901F780CC89786A2BB6298EEE` |
| `title_page` | `D2991CC03290544786A71A5B7D55C076D80818AF778363E82E12C9931B5E1407` | `F8A19FAD83F77288975AA3F1FE891AE3C4CAB3AFDFCB55B23DDE3F3539B04A5B` |

## Проверенные страницы

| Страница | Геометрия | Конкретный результат |
|---|---|---|
| `attestation_sheet/page-1.png` | A4, книжная | 6 строк; заполнена только фактическая строка, резерв пуст; две отдельные подписи преподавателей и подпись документа помещаются без обрезания. |
| `class_journal/page-1.png` | A4, книжная | Фирменная шапка сохранена; 6 строк, резервные ФИО и отметки пусты; четыре даты, преподаватель и подписант читаемы; строка часов отображается как `Количество учебных часов - 40`. |
| `enrollment_order/page-1.png` | A4, альбомная | Полная формулировка дополнительной профессиональной образовательной программы сохранена; 6 строк, резерв пуст; подпись не обрезана. |
| `expulsion_order/page-1.png` | A4, альбомная | Основная таблица содержит 6 строк; заполнена только фактическая строка; подпись помещается на странице. |
| `expulsion_order/page-2.png` | A4, альбомная | Формулировка `Отчислить без выдачи удостоверений` сохранена; отдельная строка невыдачи пустая; подпись не обрезана. |
| `pass/page-1.png` | A4, книжная | 6 строк; заполнена только фактическая строка; резерв пуст; подпись помещается без наложения. Красный цвет ФИО сохранён из исходного стиля, не добавлен компилятором. |
| `registration_book/page-1.png` | A3, альбомная | Фирменная шапка и 16-колоночная таблица читаемы; 4 строки, заполнена только фактическая; обрезания нет. |
| `schedule/page-1.png` | A4, книжная | Четыре дневные колонки и две отдельные строки подписи преподавателей видимы; перенос времени остаётся читаемым; обрезания нет. |
| `student_list/page-1.png` | A4, книжная | 6 строк; заполнена только фактическая строка; резерв пуст; строка подписи помещается. |
| `title_page/page-1.png` | A4, книжная | Шапка, заголовок, программа, даты и город выровнены; наложений и обрезания нет. |

Итог контрольного набора: 9 DOCX открылись в Word, экспортированы в 9 PDF / 10 страниц; на всех 10 страницах не обнаружены наложения или обрезание. Этот результат относится к указанным SHA-256 и не заменяет повторный render gate для другого состава группы или изменённого шаблона.
