import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PublicCourseCatalog, PublicCatalogCourse } from '@/lib/publicCourseCatalog';
import { courseCatalogLoginHref, filterPublicCourses, publicCourseText } from '@/lib/publicCourseExplorer';
import electricalCover from '@/assets/demo/course-electrical.jpg';
import fireCover from '@/assets/demo/course-fire.jpg';
import firstAidCover from '@/assets/demo/course-firstaid.jpg';
import safetyCover from '@/assets/demo/course-safety.jpg';
import aiCover from '@/assets/presentation/ai-assistant-bg.jpg';
import procurementCover from '@/assets/cover_44fz.jpg';
import documentsCover from '@/assets/demo/demo-feature-documents.jpg';
import learningCover from '@/assets/demo/demo-feature-constructor.jpg';

const PAGE_SIZE = 12;
function coverFor(course: PublicCatalogCourse) {
  const subject = `${course.title} ${course.categoryName}`.toLocaleLowerCase('ru');
  if (/44.?фз|223.?фз|закуп|контракт/.test(subject)) return procurementCover;
  if (/искусственн|нейросет|генеративн|\bии\b/.test(subject)) return aiCover;
  if (/пожар|эвакуац/.test(subject)) return fireCover;
  if (/медицин|помощ|здравоохран/.test(subject)) return firstAidCover;
  if (/электр|энергет|котельн/.test(subject)) return electricalCover;
  if (/охран|промышлен|безопас|професси|машинист|слесар/.test(subject)) return safetyCover;
  if (/кадр|бухгалтер|документ|право|юрист/.test(subject)) return documentsCover;
  return learningCover;
}

export function PublicCourseExplorer({ catalog }: { catalog: PublicCourseCatalog }) {
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = useMemo(() => filterPublicCourses(catalog.groups, query, direction), [catalog.groups, query, direction]);
  const displayed = filtered.slice(0, visibleCount);
  const reset = () => { setQuery(''); setDirection(''); setVisibleCount(PAGE_SIZE); };

  return (
    <div className="space-y-7">
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 md:p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.5fr)]">
          <div>
            <label htmlFor="public-course-search" className="mb-2 block text-sm font-medium">Какой навык хотите развить?</label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input id="public-course-search" type="search" value={query} placeholder="Название, тема или рабочая задача"
                className="h-11 rounded-xl pl-10 pr-10" onChange={event => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} />
              {query && <button type="button" aria-label="Очистить поиск" className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setQuery(''); setVisibleCount(PAGE_SIZE); }}><X className="h-4 w-4" /></button>}
            </div>
          </div>
          <div>
            <label htmlFor="public-course-direction" className="mb-2 flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />Направление</label>
            <select id="public-course-direction" value={direction} onChange={event => { setDirection(event.target.value); setVisibleCount(PAGE_SIZE); }}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Все направления</option>
              {catalog.groups.map(group => <option key={group.title} value={group.title}>{group.title} · {group.count}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Найдено: <span className="font-semibold text-foreground">{filtered.length}</span> из {catalog.totalCount} курсов</p>
          {(query || direction) && <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={reset}><X className="h-3.5 w-3.5" />Сбросить фильтры</Button>}
        </div>
      </div>

      {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center"><BookOpen className="mx-auto mb-4 h-8 w-8 text-accent" aria-hidden="true" /><h3 className="font-display text-xl">По вашему запросу курсов не найдено</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Попробуйте более короткое название или выберите другое направление.</p><Button type="button" variant="outline" className="mt-5 rounded-xl" onClick={reset}>Показать все курсы</Button></div>
        : <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Курсы публичного каталога">
          {displayed.map(course => {
            const href = courseCatalogLoginHref(course.courseId);
            return <li key={course.id} className="min-w-0"><article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm transition-colors hover:border-accent/50">
              <div className="relative aspect-[16/8] overflow-hidden bg-secondary">
                <img src={coverFor(course)} alt="" width="640" height="320" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                <span className="absolute bottom-3 left-4 rounded-full border border-white/30 bg-black/30 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">Курс СИНТАГМЫ</span>
                <span className="absolute right-3 top-3 rounded-full bg-background/95 px-3 py-1 text-xs font-semibold text-accent shadow-sm">Бесплатно</span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="mb-2 text-xs font-medium text-accent">{course.categoryName}</p>
                <h3 className="font-display text-lg font-medium leading-snug">{course.title}</h3>
                <p className="mb-5 mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{publicCourseText(course.description) || 'Откройте курс в кабинете организации, чтобы изучить материалы, состав и тесты перед назначением ученикам.'}</p>
                {href && <Button asChild variant="outline" className="mt-auto h-auto min-h-11 w-full justify-between gap-3 whitespace-normal rounded-xl text-left"><Link to={href} aria-label={`Открыть в кабинете: ${course.title}`}>Посмотреть курс<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link></Button>}
              </div>
            </article></li>;
          })}
        </ul>}

      {filtered.length > displayed.length && <div className="text-center"><Button type="button" variant="outline" size="lg" className="rounded-xl px-8" onClick={() => setVisibleCount(value => value + PAGE_SIZE)}>Показать ещё {Math.min(PAGE_SIZE, filtered.length - displayed.length)}</Button><p className="mt-3 text-xs text-muted-foreground">Показано {displayed.length} из {filtered.length}</p></div>}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">Материалы собственных курсов добавляются бесплатно. Использование СДО — по выбранному тарифу. Перед запуском обучения организация проверяет программу, материалы и условия аттестации.</p>
    </div>
  );
}
