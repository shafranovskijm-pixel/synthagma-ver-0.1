import { Globe, Apple, Smartphone, MoreVertical, Share, Plus, Menu } from "lucide-react";

export type BrowserName = 'yandex' | 'samsung' | 'firefox' | 'opera' | 'ucbrowser' | 'miui' | 'huawei' | 'edge' | 'chrome' | 'safari' | 'unknown';

export const getBrowserName = (): BrowserName => {
  const ua = navigator.userAgent;
  if (/YaBrowser|YaSearchBrowser/.test(ua)) return 'yandex';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/OPR|Opera/.test(ua)) return 'opera';
  if (/UCBrowser/.test(ua)) return 'ucbrowser';
  if (/MiuiBrowser/.test(ua)) return 'miui';
  if (/HuaweiBrowser/.test(ua)) return 'huawei';
  if (/EdgA|Edg/.test(ua)) return 'edge';
  if (/CriOS|Chrome/.test(ua)) return 'chrome';
  if (/Safari/.test(ua)) return 'safari';
  return 'unknown';
};

export const getOS = (): 'ios' | 'android' | 'desktop' => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
};

export interface BrowserInstallInfo {
  name: string;
  steps: string[];
  menuDescription: string;
}

export const getBrowserInstallInfo = (browser: BrowserName, os: 'ios' | 'android' | 'desktop'): BrowserInstallInfo => {
  if (os === 'ios') {
    return {
      name: 'Safari',
      menuDescription: 'Кнопка «Поделиться» внизу экрана',
      steps: [
        'Откройте эту страницу в браузере Safari',
        'Нажмите кнопку «Поделиться» (□↑) внизу экрана',
        'Прокрутите вниз и выберите «На экран Домой»',
        'Нажмите «Добавить» в правом верхнем углу',
      ],
    };
  }

  switch (browser) {
    case 'yandex':
      return {
        name: 'Яндекс Браузер',
        menuDescription: 'Меню (⋮) внизу справа',
        steps: [
          'Нажмите меню (три точки) внизу справа',
          'Выберите «Добавить на главный экран»',
          'Подтвердите добавление',
        ],
      };
    case 'samsung':
      return {
        name: 'Samsung Internet',
        menuDescription: 'Меню (☰) внизу',
        steps: [
          'Нажмите меню (☰) внизу экрана',
          'Выберите «Добавить на главный экран»',
          'Подтвердите добавление',
        ],
      };
    case 'firefox':
      return {
        name: 'Firefox',
        menuDescription: 'Меню (⋮) вверху справа',
        steps: [
          'Нажмите меню (три точки) вверху справа',
          'Выберите «Установить» или «Добавить на главный экран»',
          'Подтвердите установку',
        ],
      };
    case 'opera':
      return {
        name: 'Opera',
        menuDescription: 'Меню (⋮) внизу',
        steps: [
          'Нажмите меню внизу экрана',
          'Выберите «Главный экран» или «Добавить на…»',
          'Подтвердите добавление',
        ],
      };
    case 'ucbrowser':
      return {
        name: 'UC Browser',
        menuDescription: 'Меню (☰) внизу',
        steps: [
          'Нажмите меню (☰) внизу экрана',
          'Выберите «Добавить на главный экран»',
          'Подтвердите добавление',
        ],
      };
    case 'miui':
      return {
        name: 'Mi Browser',
        menuDescription: 'Меню (⋮) внизу',
        steps: [
          'Нажмите меню (три точки) внизу экрана',
          'Выберите «Добавить на рабочий стол»',
          'Подтвердите добавление',
        ],
      };
    case 'huawei':
      return {
        name: 'Huawei Browser',
        menuDescription: 'Меню (⋮) внизу',
        steps: [
          'Нажмите меню (три точки) внизу экрана',
          'Выберите «Добавить на главный экран»',
          'Подтвердите добавление',
        ],
      };
    case 'edge':
      return {
        name: 'Microsoft Edge',
        menuDescription: 'Меню (⋯) внизу',
        steps: [
          'Нажмите меню (три точки) внизу экрана',
          'Выберите «Добавить на главный экран»',
          'Подтвердите добавление',
        ],
      };
    case 'chrome':
      return {
        name: 'Google Chrome',
        menuDescription: 'Меню (⋮) вверху справа',
        steps: [
          'Нажмите меню (три точки) вверху справа',
          'Выберите «Установить приложение» или «Добавить на главный экран»',
          'Подтвердите установку',
        ],
      };
    default:
      return {
        name: 'Ваш браузер',
        menuDescription: 'Меню браузера',
        steps: [
          'Откройте меню вашего браузера',
          'Найдите пункт «Добавить на главный экран» или «Установить»',
          'Подтвердите добавление',
        ],
      };
  }
};
