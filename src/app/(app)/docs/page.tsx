'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Info,
  Lightbulb,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { getDocsCatalog, type DocArticle, type DocCallout } from '@/lib/docs/content';
import { cn } from '@/lib/cn';

function CalloutBox({ callout }: { callout: DocCallout }) {
  const styles =
    callout.tone === 'security'
      ? 'border-ready/30 bg-ready-soft/60 text-ink-2'
      : callout.tone === 'tip'
        ? 'border-accent/25 bg-accent-soft/45 text-ink-2'
        : 'border-line bg-sidebar/70 text-ink-2';

  const Icon =
    callout.tone === 'security' ? ShieldCheck : callout.tone === 'tip' ? Lightbulb : Info;
  const iconTone =
    callout.tone === 'security'
      ? 'text-ready-ink'
      : callout.tone === 'tip'
        ? 'text-accent-ink'
        : 'text-ink-2';

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed', styles)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconTone)} aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">{callout.title}</p>
        <p className="text-[13.5px] leading-relaxed">{callout.body}</p>
      </div>
    </div>
  );
}

function CopySnippet({ label, content }: { label: string; content: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-sidebar/70">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="font-mono text-[11px] font-medium text-ink-3">{label}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-ready-ink" aria-hidden="true" />
              <span>{t('Tersalin', 'Copied')}</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              <span>{t('Salin', 'Copy')}</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const { locale, t } = useLocale();
  const catalog = useMemo(() => getDocsCatalog(locale), [locale]);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>(catalog.articles[0]?.id ?? 'pengenalan');
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.articles;
    return catalog.articles.filter((a) => {
      const hay = [
        a.title,
        a.summary,
        ...(a.paragraphs ?? []),
        ...(a.steps?.flatMap((s) => [s.title, s.detail]) ?? []),
        ...(a.bullets?.flatMap((b) => [b.label, b.detail]) ?? []),
        a.callout?.title ?? '',
        a.callout?.body ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog.articles, query]);

  const groupedNav = useMemo(() => {
    const byGroup = new Map<string, DocArticle[]>();
    for (const a of filteredArticles) {
      const list = byGroup.get(a.groupId) ?? [];
      list.push(a);
      byGroup.set(a.groupId, list);
    }
    return catalog.groups
      .map((g) => ({ ...g, items: byGroup.get(g.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [catalog.groups, filteredArticles]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-92px 0px -62% 0px', threshold: [0, 1] },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredArticles]);

  const registerRef = useMemo(
    () => (id: string) => (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(id, el);
      else sectionRefs.current.delete(id);
    },
    [],
  );

  const activeIdx = filteredArticles.findIndex((a) => a.id === activeId);
  const prevArticle = activeIdx > 0 ? filteredArticles[activeIdx - 1] : null;
  const nextArticle =
    activeIdx >= 0 && activeIdx < filteredArticles.length - 1
      ? filteredArticles[activeIdx + 1]
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Compact editorial docs header + instant search */}
      <header className="mb-8 flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-ink">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              rancang-ai · {APP_VERSION}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {catalog.pageTitle}
          </h1>
          <p className="text-sm leading-relaxed text-ink-2">{catalog.pageSubtitle}</p>
        </div>

        <div className="w-full lg:w-80">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={catalog.searchPlaceholder}
              aria-label={catalog.searchPlaceholder}
              className="min-h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
            />
            {query && (
              <button
                type="button"
                aria-label={t('Bersihkan pencarian', 'Clear search')}
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-ink-3 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile horizontal jump bar */}
      <nav
        aria-label={t('Navigasi topik dokumentasi', 'Documentation topics')}
        className="mb-6 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
      >
        {filteredArticles.map((article) => (
          <a
            key={article.id}
            href={`#${article.id}`}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              activeId === article.id
                ? 'border-accent/40 bg-accent-soft text-accent-ink'
                : 'border-line bg-surface text-ink-2 hover:text-ink',
            )}
          >
            {article.title}
          </a>
        ))}
      </nav>

      {/* 3-column professional documentation layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[224px_minmax(0,1fr)] xl:grid-cols-[224px_minmax(0,1fr)_200px] xl:items-start">
        {/* Left grouped documentation sidebar */}
        <aside
          aria-label={t('Daftar bagian dokumentasi', 'Documentation sections')}
          className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2"
        >
          <nav className="space-y-5">
            {groupedNav.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = activeId === item.id;
                    return (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          aria-current={isActive ? 'true' : undefined}
                          className={cn(
                            'block rounded-lg px-2.5 py-1.5 text-[13px] leading-snug transition-colors',
                            isActive
                              ? 'bg-accent-soft/80 font-medium text-accent-ink'
                              : 'text-ink-2 hover:bg-hover/70 hover:text-ink',
                          )}
                        >
                          {item.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Center readable documentation prose */}
        <main className="min-w-0 max-w-3xl space-y-10">
          {filteredArticles.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-8 text-center space-y-2">
              <p className="text-sm font-medium text-ink">
                {t(`Tidak ada topik yang cocok dengan "${query}".`, `No topics matched "${query}".`)}
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="cursor-pointer text-xs font-medium text-accent-ink underline underline-offset-4"
              >
                {t('Tampilkan semua dokumentasi', 'Show all documentation')}
              </button>
            </div>
          ) : (
            filteredArticles.map((article) => {
              const groupTitle = catalog.groups.find((g) => g.id === article.groupId)?.title ?? '';
              return (
                <article
                  key={article.id}
                  id={article.id}
                  ref={registerRef(article.id)}
                  className="scroll-mt-20 space-y-4 border-b border-line/70 pb-9 last:border-b-0"
                >
                  <div className="space-y-1.5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                      {groupTitle}
                    </p>
                    <h2 className="text-xl font-semibold tracking-tight text-ink">
                      {article.title}
                    </h2>
                    <p className="text-[14.5px] leading-relaxed text-ink-2">{article.summary}</p>
                  </div>

                  {article.paragraphs?.map((p, i) => (
                    <p key={i} className="text-sm leading-7 text-ink-2">
                      {p}
                    </p>
                  ))}

                  {article.steps && article.steps.length > 0 && (
                    <ol className="space-y-3 pt-1">
                      {article.steps.map((step, i) => (
                        <li
                          key={step.title}
                          className="flex items-start gap-3.5 rounded-xl border border-line bg-surface p-4"
                        >
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft font-mono text-xs font-semibold text-accent-ink">
                            {i + 1}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                            <p className="text-[13.5px] leading-relaxed text-ink-2">{step.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  {article.bullets && article.bullets.length > 0 && (
                    <ul className="space-y-2.5 pt-1">
                      {article.bullets.map((b) => (
                        <li
                          key={b.label}
                          className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          />
                          <span>
                            <strong className="font-medium text-ink">{b.label}: </strong>
                            {b.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {article.table && (
                    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                      <table className="w-full border-collapse text-left text-xs sm:text-[13px]">
                        <thead>
                          <tr className="border-b border-line bg-sidebar/70">
                            {article.table.headers.map((h) => (
                              <th key={h} className="px-4 py-2.5 font-semibold text-ink">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/70">
                          {article.table.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={cn(
                                    'px-4 py-3 align-top leading-relaxed',
                                    cIdx === 0 ? 'font-medium text-ink' : 'text-ink-2',
                                  )}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {article.codeBlock && (
                    <CopySnippet label={article.codeBlock.label} content={article.codeBlock.content} />
                  )}

                  {article.callout && <CalloutBox callout={article.callout} />}

                  {article.link && (
                    <div className="pt-1">
                      <Link
                        href={article.link.href}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-xs font-medium text-accent-ink transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
                      >
                        <span>{article.link.label}</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  )}
                </article>
              );
            })
          )}

          {/* Previous / Next section footer */}
          {(prevArticle || nextArticle) && (
            <nav
              aria-label={t('Navigasi artikel', 'Article navigation')}
              className="grid gap-3 border-t border-line pt-6 sm:grid-cols-2"
            >
              {prevArticle ? (
                <a
                  href={`#${prevArticle.id}`}
                  className="group flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                    {t('Sebelumnya', 'Previous')}
                  </span>
                  <span className="text-sm font-semibold text-ink group-hover:text-accent-ink">
                    {prevArticle.title}
                  </span>
                </a>
              ) : (
                <div />
              )}
              {nextArticle && (
                <a
                  href={`#${nextArticle.id}`}
                  className="group flex flex-col items-end gap-1 rounded-xl border border-line bg-surface p-4 text-right transition-colors hover:border-line-strong"
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
                    {t('Berikutnya', 'Next')}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-ink group-hover:text-accent-ink">
                    {nextArticle.title}
                  </span>
                </a>
              )}
            </nav>
          )}
        </main>

        {/* Right sticky "On this page" TOC */}
        <aside
          aria-label={catalog.onThisPageLabel}
          className="hidden xl:sticky xl:top-20 xl:block xl:border-l xl:border-line xl:pl-4"
        >
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {catalog.onThisPageLabel}
          </p>
          <ul className="space-y-1.5 text-xs">
            {filteredArticles.map((item) => {
              const isActive = activeId === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={cn(
                      'block truncate transition-colors',
                      isActive ? 'font-medium text-accent-ink' : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    {item.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
