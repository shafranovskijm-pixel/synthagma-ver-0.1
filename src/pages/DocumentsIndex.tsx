import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FileText, Download, ArrowRight, ExternalLink } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DOCUMENT_GROUPS,
  DOCUMENTS_UPDATED_AT,
  DOCUMENTS_VERSION,
  OPERATOR,
} from "@/content/documents/manifest";

export default function DocumentsIndex() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>Документы платформы СИНТАГМА</title>
        <meta
          name="description"
          content="Договоры, правила использования и документы по персональным данным платформы СИНТАГМА. Оператор: ИП Шафрановский М.М."
        />
        <meta property="og:title" content="Документы платформы СИНТАГМА" />
        <meta
          property="og:description"
          content="Публичные документы, оферты и политики платформы СИНТАГМА."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <link rel="canonical" href="https://sintagma.com.ru/documents" />
      </Helmet>

      <LandingHeader showStars={false} />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-muted/30">
          <div className="container mx-auto px-6 py-16 md:py-20 max-w-5xl">
            <Badge variant="outline" className="mb-4">
              Редакция {DOCUMENTS_VERSION} от {DOCUMENTS_UPDATED_AT}
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight mb-4">
              Документы платформы СИНТАГМА
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
              Договоры, правила использования и документы по персональным
              данным. Согласие на обработку персональных данных и согласие на
              рассылку подтверждаются отдельно от договоров и пользовательского
              соглашения.
            </p>
          </div>
        </section>

        {/* Groups */}
        <section className="container mx-auto px-6 py-16 max-w-5xl space-y-14">
          {DOCUMENT_GROUPS.map((group) => (
            <div key={group.id}>
              <div className="mb-6">
                <h2 className="font-display text-2xl md:text-3xl font-medium tracking-tight mb-2">
                  {group.label}
                </h2>
                <p className="text-muted-foreground max-w-3xl">
                  {group.description}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {group.documents.map((doc) => (
                  <Card
                    key={doc.slug}
                    className="group hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-6 flex flex-col h-full">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-base leading-snug mb-1">
                            {doc.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {doc.audience}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground flex-1 mb-4 leading-relaxed">
                        {doc.summary}
                      </p>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          Ред. {doc.version} · {doc.updatedAt}
                        </div>
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={doc.pdfPath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="gap-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF
                            </a>
                          </Button>
                          <Button asChild size="sm">
                            <Link
                              to={`/documents/${doc.slug}`}
                              className="gap-1.5"
                            >
                              Читать
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Operator info */}
        <section className="border-t border-border bg-muted/30">
          <div className="container mx-auto px-6 py-12 max-w-5xl">
            <h2 className="font-display text-xl font-medium mb-4">
              Оператор персональных данных
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-1.5">
                <div>{OPERATOR.name}</div>
                <div>ИНН {OPERATOR.inn}</div>
                <div>ОГРНИП {OPERATOR.ogrnip}</div>
                <div>
                  Email:{" "}
                  <a
                    className="underline hover:text-foreground"
                    href={`mailto:${OPERATOR.email}`}
                  >
                    {OPERATOR.email}
                  </a>
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  Реестр Роскомнадзора:{" "}
                  <a
                    className="underline hover:text-foreground inline-flex items-center gap-1"
                    href={OPERATOR.rknUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    № {OPERATOR.rknNumber}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div>
                  Сайты:{" "}
                  <a
                    className="underline hover:text-foreground"
                    href="https://синтагма.рф/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    синтагма.рф
                  </a>
                  {" · "}
                  <a
                    className="underline hover:text-foreground"
                    href="https://sintagma.com.ru/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    sintagma.com.ru
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
