import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { SignatureStampBlock } from "@/components/proposal/SignatureStampBlock";
import { Button } from "@/components/ui/button";
import {
  getDocumentBySlug,
  LEGACY_SLUG_MAP,
  OPERATOR,
} from "@/content/documents/manifest";

export default function DocumentPage() {
  const { slug = "" } = useParams<{ slug: string }>();

  // Legacy redirect: /documents/public-offer -> /documents/paid-plan-offer etc.
  const legacy = LEGACY_SLUG_MAP[slug];
  if (legacy && legacy !== slug) {
    return <Navigate to={`/documents/${legacy}`} replace />;
  }

  const doc = getDocumentBySlug(slug);

  // Strip YAML frontmatter (--- ... ---) that ships in the source markdown.
  const body = useMemo(() => {
    if (!doc) return "";
    return doc.content.replace(/^---[\s\S]*?---\s*/m, "").trimStart();
  }, [doc]);

  if (!doc) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <LandingHeader showStars={false} />
        <main className="flex-1 container mx-auto px-6 py-20 max-w-2xl text-center">
          <h1 className="font-display text-3xl font-medium mb-3">
            Документ не найден
          </h1>
          <p className="text-muted-foreground mb-6">
            Такой документ отсутствует. Вернитесь в раздел «Документы».
          </p>
          <Button asChild>
            <Link to="/documents" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              К списку документов
            </Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const shortDesc = doc.summary.slice(0, 155);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>{doc.title} — СИНТАГМА</title>
        <meta name="description" content={shortDesc} />
        <meta property="og:title" content={`${doc.title} — СИНТАГМА`} />
        <meta property="og:description" content={shortDesc} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary" />
        <link
          rel="canonical"
          href={`https://sintagma.com.ru/documents/${doc.slug}`}
        />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "DigitalDocument",
            name: doc.title,
            description: doc.summary,
            version: doc.version,
            dateModified: "2026-07-19",
            inLanguage: "ru-RU",
            publisher: {
              "@type": "Organization",
              name: OPERATOR.short,
            },
            url: `https://sintagma.com.ru/documents/${doc.slug}`,
          })}
        </script>
        <style>{`
          @media print {
            .doc-print-hide { display: none !important; }
            main { padding: 0 !important; }
            .doc-body { max-width: none !important; }
          }
        `}</style>
      </Helmet>

      <div className="doc-print-hide">
        <LandingHeader showStars={false} />
      </div>

      <main className="flex-1">
        <div className="container mx-auto px-6 py-10 max-w-3xl">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8 doc-print-hide">
            <Button asChild variant="ghost" size="sm">
              <Link to="/documents" className="gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Все документы
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Печать
              </Button>
              <Button asChild size="sm" className="gap-1.5">
                <a
                  href={doc.pdfPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Download className="w-4 h-4" />
                  Скачать PDF
                </a>
              </Button>
            </div>
          </div>

          {/* Meta */}
          <div className="mb-8">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
              Редакция {doc.version} · {doc.updatedAt} · {doc.audience}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-tight">
              {doc.title}
            </h1>
          </div>

          {/* Body */}
          <article
            className="doc-body prose prose-neutral dark:prose-invert max-w-none
                       prose-headings:font-display prose-headings:font-medium
                       prose-h1:hidden
                       prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                       prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2
                       prose-p:leading-relaxed
                       prose-a:text-primary hover:prose-a:underline
                       prose-table:text-sm"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
              {body}
            </ReactMarkdown>
          </article>

          {/* Подпись и печать оператора */}
          <div className="mt-10 pt-6 border-t border-border">
            <SignatureStampBlock />
          </div>

          {/* Footer meta */}
          <div className="mt-14 pt-6 border-t border-border text-xs text-muted-foreground doc-print-hide">
            Документ является публичной редакцией {doc.version} от{" "}
            {doc.updatedAt}. Оператор: {OPERATOR.short}, ИНН {OPERATOR.inn},
            реестр Роскомнадзора №{" "}
            <a
              href={OPERATOR.rknUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              {OPERATOR.rknNumber}
            </a>
            .
          </div>
        </div>
      </main>

      <div className="doc-print-hide">
        <Footer />
      </div>
    </div>
  );
}
