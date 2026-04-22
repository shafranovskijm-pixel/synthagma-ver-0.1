
CREATE TABLE IF NOT EXISTS public.proposal_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'org')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('course_promo', 'corporate', 'webinar', 'consulting', 'subscription', 'custom')),
  cover_url TEXT,
  intro_html TEXT NOT NULL DEFAULT '',
  outro_html TEXT NOT NULL DEFAULT '',
  default_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  linked_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  default_email_template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_presets_org_required CHECK (
    (scope = 'platform' AND organization_id IS NULL) OR
    (scope = 'org' AND organization_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_proposal_presets_scope ON public.proposal_presets(scope) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proposal_presets_org ON public.proposal_presets(organization_id) WHERE deleted_at IS NULL;

ALTER TABLE public.proposal_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform proposal presets readable" ON public.proposal_presets
  FOR SELECT TO authenticated
  USING (scope = 'platform' AND deleted_at IS NULL);

CREATE POLICY "org proposal presets readable by staff" ON public.proposal_presets
  FOR SELECT TO authenticated
  USING (
    scope = 'org' AND deleted_at IS NULL AND organization_id IN (
      SELECT os.organization_id FROM public.org_staff os WHERE os.user_id = auth.uid()
    )
  );

CREATE POLICY "platform proposal presets manageable by admins" ON public.proposal_presets
  FOR ALL TO authenticated
  USING (scope = 'platform' AND public.has_role('admin'::public.app_role, auth.uid()))
  WITH CHECK (scope = 'platform' AND public.has_role('admin'::public.app_role, auth.uid()));

CREATE POLICY "org proposal presets manageable by staff" ON public.proposal_presets
  FOR ALL TO authenticated
  USING (
    scope = 'org' AND organization_id IN (
      SELECT os.organization_id FROM public.org_staff os WHERE os.user_id = auth.uid()
    )
  )
  WITH CHECK (
    scope = 'org' AND organization_id IN (
      SELECT os.organization_id FROM public.org_staff os WHERE os.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_proposal_presets_updated_at
  BEFORE UPDATE ON public.proposal_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commercial_proposals
  ADD COLUMN IF NOT EXISTS preset_id UUID REFERENCES public.proposal_presets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intro_html TEXT,
  ADD COLUMN IF NOT EXISTS outro_html TEXT;

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS linked_course_id UUID,
  ADD COLUMN IF NOT EXISTS linked_webinar_id UUID;

INSERT INTO public.proposal_presets (scope, name, description, category, intro_html, outro_html, default_services, default_discount_percent, sort_order, is_default)
VALUES
('platform', 'Стартовый пакет «Курс под ключ»', 'Запуск онлайн-курса с методическим сопровождением за 3 шага', 'course_promo',
'<div style="background:linear-gradient(135deg,#1AAB9B 0%,#0e7c70 100%);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h2 style="margin:0 0 12px;font-size:28px">Запустим ваш курс под ключ за 14 дней</h2><p style="margin:0;font-size:16px;opacity:0.95">Полный цикл: от концепции до первых учеников. Методолог, продюсер и техподдержка в одной команде.</p></div>',
'<div style="margin-top:32px;padding:24px;background:#f0fdfa;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h3 style="margin:0 0 12px;color:#0e7c70">Что входит в пакет</h3><ul style="margin:0;padding-left:20px;color:#334155;line-height:1.8"><li>Персональный методолог и продюсер</li><li>До 35 уроков в курсе</li><li>Тесты, домашние задания, итоговая аттестация</li><li>Выдача удостоверений с занесением в ФИС ФРДО</li><li>Техподдержка 24/7 в первый месяц</li></ul></div>',
'[{"name":"Запуск курса под ключ","description":"Методология, контент, лендинг, настройка оплаты","price":30000,"quantity":1},{"name":"Методическое сопровождение (1 месяц)","description":"Персональный куратор, корректировки, аналитика","price":15000,"quantity":1}]'::jsonb,
0, 1, true),

('platform', 'Корпоративное обучение группы 10–50 чел.', 'Пакет для обучения сотрудников компании со скидкой 15%', 'corporate',
'<div style="background:linear-gradient(135deg,#6366f1 0%,#4338ca 100%);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><div style="display:inline-block;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">КОРПОРАТИВНЫЙ ПАКЕТ</div><h2 style="margin:0 0 12px;font-size:28px">Обучение для команды {{company_name}}</h2><p style="margin:0;font-size:16px;opacity:0.95">Скидка 15% на групповое обучение, единый кабинет руководителя, отчётность по каждому сотруднику.</p></div>',
'<div style="margin-top:32px;padding:24px;background:#fef3c7;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h3 style="margin:0 0 12px;color:#92400e">Преимущества для бизнеса</h3><ul style="margin:0;padding-left:20px;color:#78350f;line-height:1.8"><li>Единый кабинет HR с прогрессом по каждому сотруднику</li><li>Закрывающие документы в один клик</li><li>Удостоверения с регистрацией ФИС ФРДО</li><li>Корпоративная скидка 15% автоматически</li></ul></div>',
'[{"name":"Обучение сотрудника","description":"Доступ к курсу + удостоверение","price":3500,"quantity":15},{"name":"Кабинет руководителя HR","description":"Аналитика, отчёты, управление группой","price":0,"quantity":1}]'::jsonb,
15, 2, false),

('platform', 'Промо нового курса', 'Презентация нового курса с акцентом на программу и результат', 'course_promo',
'<div style="background:linear-gradient(135deg,#ec4899 0%,#db2777 100%);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><div style="display:inline-block;background:rgba(255,255,255,0.25);padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">🆕 НОВЫЙ КУРС</div><h2 style="margin:0 0 12px;font-size:28px">{{course_name}}</h2><p style="margin:0 0 16px;font-size:16px;opacity:0.95">Программа повышения квалификации с выдачей удостоверения. Длительность {{course_duration}}.</p><a href="{{course_url}}" style="display:inline-block;background:#fff;color:#db2777;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Посмотреть программу →</a></div>',
'<div style="margin-top:32px;padding:24px;background:#fdf2f8;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h3 style="margin:0 0 12px;color:#9d174d">Почему выбирают этот курс</h3><ul style="margin:0;padding-left:20px;color:#831843;line-height:1.8"><li>Актуальная программа от практикующих экспертов</li><li>Удостоверение установленного образца, регистрация в ФИС ФРДО</li><li>Доступ к материалам навсегда</li><li>Поддержка куратора на всём протяжении обучения</li></ul></div>',
'[{"name":"{{course_name}}","description":"Полный доступ к курсу + удостоверение","price":7500,"quantity":1}]'::jsonb,
0, 3, false),

('platform', 'Приглашение на вебинар + апселл курса', 'Бесплатный вебинар как лид-магнит со скидкой на основной курс', 'webinar',
'<div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><div style="display:inline-block;background:rgba(255,255,255,0.25);padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">🎁 БЕСПЛАТНЫЙ ВЕБИНАР</div><h2 style="margin:0 0 12px;font-size:28px">{{webinar_title}}</h2><p style="margin:0 0 8px;font-size:16px;opacity:0.95">📅 {{webinar_date}} в {{webinar_time}}</p><p style="margin:0 0 16px;font-size:14px;opacity:0.9">+ для всех участников вебинара — скидка 30% на основной курс</p></div>',
'<div style="margin-top:32px;padding:24px;background:#fffbeb;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h3 style="margin:0 0 12px;color:#92400e">Что вы получите</h3><ul style="margin:0;padding-left:20px;color:#78350f;line-height:1.8"><li>2 часа практики от ведущего эксперта</li><li>Запись вебинара навсегда</li><li>Чек-лист и рабочие материалы</li><li>Скидку 30% на основной курс — действует 48 часов после вебинара</li></ul></div>',
'[{"name":"Участие в вебинаре","description":"Доступ + запись + материалы","price":0,"quantity":1},{"name":"Курс со скидкой 30% (опция)","description":"Активируется после посещения вебинара","price":5250,"quantity":1}]'::jsonb,
0, 4, false),

('platform', 'Консультация HR / Охрана труда', 'Экспертная упаковка консалтинговых услуг', 'consulting',
'<div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h2 style="margin:0 0 12px;font-size:28px">Экспертный аудит и консультация</h2><p style="margin:0;font-size:16px;opacity:0.95">Персональная работа с практикующим специалистом. Решаем точечные задачи без шаблонов.</p></div>',
'<div style="margin-top:32px;padding:24px;background:#ecfdf5;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h3 style="margin:0 0 12px;color:#065f46">Гарантии</h3><ul style="margin:0;padding-left:20px;color:#047857;line-height:1.8"><li>Эксперт с опытом 10+ лет в отрасли</li><li>Конфиденциальность по NDA</li><li>Возврат 100% оплаты, если не подойдём друг другу после 1-й встречи</li></ul></div>',
'[{"name":"Аудит и диагностика","description":"Анализ текущих процессов, выявление узких мест","price":25000,"quantity":1},{"name":"Сопровождение внедрения (4 недели)","description":"Еженедельные встречи + правки документов","price":40000,"quantity":1}]'::jsonb,
0, 5, false),

('platform', 'Годовое сопровождение / абонемент', 'Безлимитное обучение для всей команды на 12 месяцев', 'subscription',
'<div style="background:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><div style="display:inline-block;background:rgba(255,255,255,0.25);padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">⭐ ГОДОВОЙ АБОНЕМЕНТ</div><h2 style="margin:0 0 12px;font-size:28px">Безлимит на год для всей команды</h2><p style="margin:0;font-size:16px;opacity:0.95">Все курсы платформы для всех ваших сотрудников. Один счёт раз в год — никакой бюрократии.</p></div>',
'<div style="margin-top:32px;padding:24px;background:#faf5ff;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><h3 style="margin:0 0 12px;color:#5b21b6">Что включено</h3><ul style="margin:0;padding-left:20px;color:#6d28d9;line-height:1.8"><li>Все курсы каталога без ограничений</li><li>Все новые программы, выпускаемые в течение года</li><li>Удостоверения для всех завершивших обучение</li><li>Персональный менеджер аккаунта</li><li>Приоритетная техподдержка</li></ul></div>',
'[{"name":"Годовой абонемент «Безлимит»","description":"Все курсы для всех сотрудников на 12 мес.","price":180000,"quantity":1}]'::jsonb,
0, 6, false);

INSERT INTO public.email_templates (scope, organization_id, name, category, subject, html_body, variables, is_default)
VALUES
('platform', NULL, 'Приглашение на курс — короткое', 'course_invite', '{{course_name}} — открыли набор',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#1AAB9B,#0e7c70);padding:32px;text-align:center;color:#fff"><h1 style="margin:0;font-size:26px">{{course_name}}</h1><p style="margin:8px 0 0;opacity:0.9">Открыт набор на новый поток</p></div><div style="padding:32px"><p>Здравствуйте, {{contact_person}}!</p><p>Мы открыли набор на программу «<b>{{course_name}}</b>». Длительность — {{course_duration}}, по итогу — удостоверение установленного образца.</p><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#1AAB9B;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Записаться на курс</a></div><p style="color:#64748b;font-size:14px">Если есть вопросы — просто ответьте на это письмо.</p></div></div>',
'["course_name","course_duration","course_url","contact_person"]'::jsonb, false),

('platform', NULL, 'Приглашение на курс — экспертное', 'course_invite', '{{course_name}}: получите удостоверение за {{course_duration}}',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0f172a;padding:40px 32px;color:#fff"><div style="display:inline-block;background:rgba(26,171,155,0.2);color:#5eead4;padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:16px">ПРОГРАММА ПК</div><h1 style="margin:0 0 8px;font-size:28px">{{course_name}}</h1><p style="margin:0;color:#94a3b8">Длительность: {{course_duration}} · Цена: {{course_price}} ₽</p></div><div style="padding:32px"><p>{{contact_person}}, добрый день!</p><p>Эта программа подойдёт вам, если нужно официально подтвердить квалификацию и при этом не отрываться от работы — обучение полностью онлайн, в удобном темпе.</p><h3 style="color:#1AAB9B;margin:24px 0 12px">Что вы получите</h3><ul style="line-height:1.8;color:#334155"><li>Удостоверение установленного образца</li><li>Регистрацию в ФИС ФРДО</li><li>Доступ к материалам навсегда</li><li>Поддержку куратора</li></ul><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#1AAB9B;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Перейти к программе</a></div></div></div>',
'["course_name","course_duration","course_price","course_url","contact_person"]'::jsonb, false),

('platform', NULL, 'Приглашение группы (B2B)', 'course_invite', 'Обучение для сотрудников {{company_name}} — бесплатный пилот',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:32px;color:#fff"><h1 style="margin:0;font-size:26px">Обучение команды {{company_name}}</h1><p style="margin:8px 0 0;opacity:0.9">Бесплатный пилот на 5 сотрудников</p></div><div style="padding:32px"><p>Здравствуйте, {{contact_person}}!</p><p>Предлагаем {{company_name}} протестировать обучение на нашей платформе — <b>5 бесплатных мест на любой курс каталога</b>. После пилота вы решите, масштабировать ли на всю команду.</p><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#4338ca;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Запустить пилот</a></div></div></div>',
'["company_name","contact_person","course_url"]'::jsonb, false),

('platform', NULL, 'Бесплатный вебинар — анонс', 'webinar_invite', 'Вебинар «{{webinar_title}}» {{webinar_date}}',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px;color:#fff"><div style="display:inline-block;background:rgba(255,255,255,0.25);padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">🎁 БЕСПЛАТНО</div><h1 style="margin:0 0 8px;font-size:26px">{{webinar_title}}</h1><p style="margin:0;opacity:0.95">📅 {{webinar_date}} в {{webinar_time}}</p></div><div style="padding:32px"><p>{{contact_person}}, приглашаем на бесплатный вебинар!</p><p>За 2 часа разберём практические кейсы, ответим на вопросы и поделимся рабочими материалами.</p><div style="text-align:center;margin:32px 0"><a href="{{webinar_url}}" style="display:inline-block;background:#d97706;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Зарегистрироваться</a></div></div></div>',
'["webinar_title","webinar_date","webinar_time","webinar_url","contact_person"]'::jsonb, false),

('platform', NULL, 'Вебинар — напоминание за день', 'webinar_invite', 'Завтра в {{webinar_time}} — не пропустите',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#fef3c7;padding:24px;text-align:center;border-bottom:3px solid #f59e0b"><div style="font-size:48px;margin-bottom:8px">⏰</div><h1 style="margin:0;font-size:24px;color:#92400e">Вебинар уже завтра</h1></div><div style="padding:32px"><p>{{contact_person}}, напоминаем: завтра в <b>{{webinar_time}}</b> вебинар «<b>{{webinar_title}}</b>».</p><div style="text-align:center;margin:32px 0"><a href="{{webinar_url}}" style="display:inline-block;background:#d97706;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Открыть страницу вебинара</a></div></div></div>',
'["webinar_title","webinar_time","webinar_url","contact_person"]'::jsonb, false),

('platform', NULL, 'После вебинара — спецоффер', 'webinar_invite', 'Спасибо за вебинар. Скидка 20% на {{course_name}} 48 часов',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#1AAB9B,#0e7c70);padding:32px;color:#fff;text-align:center"><div style="font-size:48px;margin-bottom:8px">🎉</div><h1 style="margin:0;font-size:26px">Спасибо, что были с нами!</h1></div><div style="padding:32px"><p>{{contact_person}}, было здорово видеть вас на вебинаре.</p><p>Как и обещали, для участников действует <b>специальная скидка 20%</b> на курс «{{course_name}}». Промокод применится автоматически по ссылке ниже.</p><div style="background:#f0fdfa;border:2px dashed #1AAB9B;padding:20px;border-radius:10px;text-align:center;margin:24px 0"><div style="font-size:13px;color:#0e7c70;margin-bottom:4px">ВАША СКИДКА</div><div style="font-size:36px;font-weight:700;color:#1AAB9B">−20%</div><div style="font-size:13px;color:#64748b;margin-top:4px">действует 48 часов</div></div><div style="text-align:center;margin:24px 0"><a href="{{course_url}}" style="display:inline-block;background:#1AAB9B;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Забрать скидку</a></div></div></div>',
'["course_name","course_url","contact_person"]'::jsonb, false),

('platform', NULL, 'Новинка маркетплейса', 'promo', '6 новых программ ПК уже доступны',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#ec4899,#db2777);padding:32px;color:#fff;text-align:center"><h1 style="margin:0;font-size:26px">6 новых программ повышения квалификации</h1></div><div style="padding:32px"><p>{{contact_person}}, в каталоге появились свежие программы:</p><ul style="line-height:2;color:#334155"><li>Юрист: договорная и претензионная работа</li><li>Менеджер по маркетингу</li><li>Бухгалтер: учёт, налоги и отчётность</li><li>HR-менеджер</li><li>Специалист по охране труда</li><li>Психолог-консультант</li></ul><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#db2777;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Открыть каталог</a></div></div></div>',
'["contact_person","course_url"]'::jsonb, false),

('platform', NULL, 'Сезонная акция', 'promo', '−25% на все программы до конца месяца',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:40px 32px;color:#fff;text-align:center"><div style="font-size:64px;font-weight:800;line-height:1">−25%</div><div style="margin-top:8px;font-size:18px;opacity:0.95">на все программы каталога</div></div><div style="padding:32px"><p>{{contact_person}}, до конца месяца действует <b>скидка 25%</b> на любую программу обучения.</p><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#dc2626;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Выбрать программу</a></div></div></div>',
'["contact_person","course_url"]'::jsonb, false),

('platform', NULL, 'Реактивация скидкой', 'promo', '{{contact_person}}, мы скучаем. Возвращайтесь со скидкой 30%',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#fef3c7;padding:40px 32px;text-align:center"><div style="font-size:48px;margin-bottom:8px">👋</div><h1 style="margin:0;font-size:26px;color:#92400e">{{contact_person}}, давно не виделись</h1></div><div style="padding:32px"><p>За время вашего отсутствия мы добавили десятки новых программ. Приготовили <b>персональную скидку 30%</b>. Действует 7 дней.</p><div style="text-align:center;margin:24px 0"><a href="{{course_url}}" style="display:inline-block;background:#d97706;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Посмотреть каталог</a></div></div></div>',
'["contact_person","course_url"]'::jsonb, false),

('platform', NULL, 'Кейс / отзыв клиента', 'nurture', 'Как {{example_company}} обучили 47 сотрудников за месяц',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f8fafc;padding:32px;border-bottom:4px solid #1AAB9B"><div style="display:inline-block;background:#1AAB9B;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">КЕЙС</div><h1 style="margin:0;font-size:24px;color:#0f172a">Как {{example_company}} обучили 47 сотрудников за месяц</h1></div><div style="padding:32px"><p>{{contact_person}}, делимся реальной историей:</p><blockquote style="border-left:4px solid #1AAB9B;padding:16px 20px;background:#f0fdfa;margin:24px 0;font-style:italic;color:#0e7c70">«За месяц всю команду перевели на новые регламенты. Раньше уходило полгода и куча бумажной волокиты — здесь всё в одном кабинете.»</blockquote><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#1AAB9B;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Сделать так же</a></div></div></div>',
'["example_company","contact_person","course_url"]'::jsonb, false),

('platform', NULL, 'Лид-магнит: чек-лист', 'nurture', 'Чек-лист: 12 ошибок при выборе платформы обучения',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#0ea5e9,#0369a1);padding:32px;color:#fff"><div style="display:inline-block;background:rgba(255,255,255,0.25);padding:4px 12px;border-radius:20px;font-size:12px;margin-bottom:12px">📋 БЕСПЛАТНО</div><h1 style="margin:0;font-size:24px">Чек-лист: 12 ошибок при выборе платформы обучения</h1></div><div style="padding:32px"><p>{{contact_person}}, выбираете LMS? Скачайте наш чек-лист — поможет избежать классических ошибок и сэкономить бюджет.</p><div style="text-align:center;margin:32px 0"><a href="{{course_url}}" style="display:inline-block;background:#0369a1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Скачать чек-лист</a></div></div></div>',
'["contact_person","course_url"]'::jsonb, false),

('platform', NULL, 'Отправка КП — продающее', 'proposal', '{{company_name}}, ваш персональный расчёт внутри',
'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:linear-gradient(135deg,#1AAB9B,#0e7c70);padding:32px;color:#fff"><h1 style="margin:0;font-size:26px">Коммерческое предложение</h1><p style="margin:8px 0 0;opacity:0.9">для {{company_name}}</p></div><div style="padding:32px"><p>Здравствуйте, {{contact_person}}!</p><p>Подготовили для вас персональный расчёт. Внутри — состав работ, сроки, стоимость и условия.</p><div style="background:#f0fdfa;padding:20px;border-radius:10px;margin:24px 0"><div style="color:#0e7c70;font-weight:600;margin-bottom:8px">📌 Действует до</div><div style="font-size:18px;color:#0f172a">{{valid_until}}</div></div><div style="text-align:center;margin:32px 0"><a href="{{proposal_url}}" style="display:inline-block;background:#1AAB9B;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600">Открыть КП</a></div><p style="margin-top:24px">С уважением,<br><b>{{sender_name}}</b><br>{{org_name}}</p></div></div>',
'["company_name","contact_person","valid_until","proposal_url","sender_name","org_name"]'::jsonb, false);
