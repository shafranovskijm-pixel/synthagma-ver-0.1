import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, CalendarDays, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import '@/components/driving-school/driving-school.css';
const seoTitle = 'Программа для автошколы: ученики и расписание вождения — СИНТАГМА';
const seoDescription = 'Модуль автошкол СИНТАГМА (Beta): ученики и группы, расписание вождения, фактические часы практики и ручной учёт оплат в общем кабинете.';
const canonicalUrl = 'https://xn--80aaiswd0ak.xn--p1ai/auto-schools';

export default function AutoSchools(){return <main className="driving-school-root" style={{minHeight:'100svh',background:'#faf9f6'}}>
  <Helmet>
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <link rel="canonical" href={canonicalUrl} />
    <meta property="og:type" content="website" />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:url" content={canonicalUrl} />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
  </Helmet>
  <div className="page-content" style={{maxWidth:1080,margin:'auto'}}><div className="actions"><Link to="/" className="brand"><b>Σ</b><span>СИНТАГМА<small>Автошколы</small></span></Link><span className="tag">Автошколы · Beta</span></div><section className="panel" style={{padding:'clamp(24px,5vw,64px)',marginTop:24}}><span className="eyebrow">ОТДЕЛЬНЫЙ КОНТУР В СИНТАГМЕ</span><h1 style={{fontFamily:'Georgia,serif',fontSize:'clamp(32px,5vw,52px)',margin:'20px 0'}}>Ученики. Вождение.<br/>Всё по расписанию.</h1><p style={{maxWidth:660}}>Отдельные кабинеты автошколы объединяют расписание, фактическую практику и ручной учёт оплат. Вход — через вашу общую учётную запись СИНТАГМЫ. Обычный кабинет слушателя сохраняется.</p><div className="callout">Владелец осознанно подключает модуль к своей организации и задаёт часовой пояс школы. Ученики и инструкторы входят после действующей привязки к этой школе. Одна регистрация в СИНТАГМЕ не включает автошколу автоматически.</div><div className="actions" style={{marginTop:24}}><Button asChild><Link to="/login?next=%2Forganization%2Fdriving-school">Войти как организация <ArrowRight/></Link></Button><Button asChild variant="outline"><Link to="/register-organization?module=driving-school">Зарегистрировать организацию</Link></Button><Button asChild variant="ghost"><Link to="/driving-school">Кабинет ученика или инструктора</Link></Button></div></section><div className="stat-grid three">{[[Users,'Ученики и группы','Программа, инструктор и фактические часы в карточке ученика.'],[CalendarDays,'Занятия и практика','Запись, перенос и подтверждение занятия с часовым поясом школы.'],[Wallet,'Ручной учёт','Начисления, оплаты и исправления с сохранением истории.']].map(([Icon,title,description])=>{const Glyph=Icon as typeof Users;return <section className="panel stack" key={String(title)}><Glyph/><h3>{String(title)}</h3><p>{String(description)}</p></section>;})}</div><p className="muted">Контур работает в режиме Beta. Формы документов — черновики до утверждения вашей автошколой; материалы и программа задаются школой. Банковская интеграция, официальный банк ПДД, выдача квалификации и передача сведений в государственные системы не заявлены.</p></div></main>;}
