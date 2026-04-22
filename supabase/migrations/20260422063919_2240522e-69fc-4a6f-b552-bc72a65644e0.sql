INSERT INTO public.email_templates (
  scope, organization_id, name, category, subject, html_body, variables, is_default, created_by
)
SELECT
  'platform', NULL,
  'Приглашение на презентацию',
  'presentation',
  'Приглашаем на презентацию платформы Sintagma — {{date}}',
  $html$
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;color:#0f172a;">
  <div style="padding:48px 40px 32px;text-align:center;border-bottom:1px solid #e2e8f0;">
    <div style="display:inline-block;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#14b8a6,#06b6d4);line-height:56px;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">S</div>
    <h1 style="margin:24px 0 8px;font-size:28px;font-weight:600;letter-spacing:-0.5px;color:#0f172a;">Приглашаем на презентацию</h1>
    <p style="margin:0;font-size:15px;color:#64748b;">Платформа онлайн-обучения Sintagma</p>
  </div>
  <div style="padding:40px;">
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#334155;">Здравствуйте, {{name}}!</p>
    <p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#334155;">
      Приглашаем вас на онлайн-презентацию платформы Sintagma. За 30 минут покажем, как автоматизировать обучение сотрудников, выдачу удостоверений и отчётность ФИС ФРДО.
    </p>
    <div style="background:linear-gradient(135deg,#f0fdfa,#ecfeff);border:1px solid #99f6e4;border-radius:16px;padding:28px;text-align:center;margin:0 0 32px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0d9488;">Когда</p>
      <p style="margin:0 0 4px;font-size:24px;font-weight:600;color:#0f172a;">{{date}}</p>
      <p style="margin:0;font-size:18px;color:#475569;">{{time}} (МСК)</p>
    </div>
    <div style="text-align:center;margin:0 0 32px;">
      <a href="{{webinar_url}}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#14b8a6,#06b6d4);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;box-shadow:0 4px 12px rgba(20,184,166,0.3);">
        Присоединиться к встрече
      </a>
      <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Ссылка станет активной за 15 минут до начала</p>
    </div>
    <div style="border-top:1px solid #e2e8f0;padding-top:28px;">
      <p style="margin:0 0 16px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Программа встречи</p>
      <ul style="margin:0;padding:0;list-style:none;">
        <li style="padding:8px 0;font-size:14px;color:#334155;line-height:1.5;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#14b8a6;margin-right:12px;vertical-align:middle;"></span>Обзор возможностей платформы</li>
        <li style="padding:8px 0;font-size:14px;color:#334155;line-height:1.5;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#14b8a6;margin-right:12px;vertical-align:middle;"></span>Демо: создание курса и зачисление сотрудников</li>
        <li style="padding:8px 0;font-size:14px;color:#334155;line-height:1.5;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#14b8a6;margin-right:12px;vertical-align:middle;"></span>Ответы на ваши вопросы</li>
      </ul>
    </div>
  </div>
  <div style="padding:24px 40px 40px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="margin:0 0 4px;font-size:14px;color:#475569;">С уважением,</p>
    <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">{{host_name}}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">sintagma.com.ru</p>
  </div>
</div>
  $html$,
  '["name","date","time","webinar_url","host_name"]'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE scope = 'platform' AND category = 'presentation' AND is_default = true AND deleted_at IS NULL
);