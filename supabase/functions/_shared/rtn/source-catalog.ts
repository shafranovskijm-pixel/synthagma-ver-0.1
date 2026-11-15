// App-owned public sources, not client course imports. Changing this allowlist is a reviewed release.
export const INITIAL_RTN_SOURCES = [
  {
    code: 'rtn-industrial-a1-public', title: 'А.1 — опубликованный перечень Ростехнадзора',
    page_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/voprosy-testirovaniya-s-1-sentyabrya-2024-g-/obshchie-trebovaniya-promyshlennoy-bezopasnosti/index.php',
    document_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/voprosy-testirovaniya-s-1-sentyabrya-2024-g-/obshchie-trebovaniya-promyshlennoy-bezopasnosti/%D0%90.1.%20%D0%9E%D1%81%D0%BD%D0%BE%D0%B2%D1%8B%20%D0%BF%D1%80%D0%BE%D0%BC%D1%8B%D1%88%D0%BB%D0%B5%D0%BD%D0%BD%D0%BE%D0%B9%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf',
    trusted_anchor_rule: 'a1', parser: 'industrial-pdf',
    banks: [{ code: 'A.1', title: 'А.1 — основы промышленной безопасности: опубликованные вопросы', domain: 'industrial-safety' }],
  },
  {
    code: 'rtn-energy-supervision-public', title: 'Энергонадзор — опубликованные вопросы проверки знаний',
    page_url: 'https://www.gosnadzor.ru/energy/energy/List%20of%20issues%20(tests)%20of%20energy%20supervision/',
    document_url: 'https://www.gosnadzor.ru/energy/energy/The%20list%20of%20issues%20of%20energy%20supervision/2026/%D0%9F%D0%B5%D1%80%D0%B5%D1%87%D0%B5%D0%BD%D1%8C_%D1%82%D0%B5%D1%81%D1%82%D0%BE%D0%B2%D1%8B%D1%85_01.09.26.xlsx',
    trusted_anchor_rule: 'energy-xlsx', parser: 'energy-xlsx',
    banks: [
      ['I', 'Вопросы для работников электросетевых организаций (обслуживающих организаций)'],
      ['II', 'Вопросы для работников электростанций, в том числе функционирующих в режиме комбинированной выработки и гидроэлектростанций'],
      ['III', 'Вопросы для работников организаций, потребителей тепловой энергии (обслуживающих организаций)'],
      ['IV', 'Вопросы для работников теплоснабжающих и теплосетевых организаций'],
      ['V', 'Вопросы для работников организаций потребителей электрической энергии (обслуживающих организаций)'],
      ['V (непром. потребители)', 'Электрическая энергия — непромышленные потребители'],
      ['VI', 'Вопросы для работников субъектов оперативно-диспетчерского управления'],
    ].map(([sheet, title]) => ({ code: `ENERGY-${sheet}`, title, domain: 'energy_supervision_knowledge_check' })),
  },
];
