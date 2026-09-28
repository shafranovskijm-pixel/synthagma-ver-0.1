import { Helmet } from "react-helmet-async";

// Runtime owner of the matching data-rh fallback tags in index.html.
// Route-level Helmet instances override these defaults and restore them on exit.
export function DefaultMetadata() {
  return (
    <Helmet>
      <title>СИНТАГМА — СДО и документооборот для организаций</title>
      <meta name="description" content="СИНТАГМА — система дистанционного обучения и документооборота для учебных центров: курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете." />
      <meta name="keywords" content="дистанционное обучение, документооборот организации, СДО, образовательная платформа, учебный центр, онлайн курсы" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="СИНТАГМА — СДО и документооборот для организаций" />
      <meta property="og:description" content="Курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете." />
      <meta property="og:image" content="https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg" />
      <meta property="og:image:alt" content="Форма регистрации организации в СИНТАГМЕ" />
      <meta property="og:url" content="https://xn--80aaiswd0ak.xn--p1ai/" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="СИНТАГМА — СДО и документооборот для организаций" />
      <meta name="twitter:description" content="Курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете." />
      <meta name="twitter:image" content="https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg" />
    </Helmet>
  );
}
