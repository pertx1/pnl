import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Container, SectionHeading } from "@/components/marketing/section-heading";
import { formatDate, getAllPosts } from "./posts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.blog");
  return {
    title: t("title"),
    description: t("description"),
    openGraph: { title: t("title"), description: t("description"), type: "website", siteName: "Kreo" },
  };
}

export default async function BlogPage() {
  const [t, locale, posts] = await Promise.all([getTranslations("landing.blog"), getLocale(), getAllPosts()]);
  return (
    <Container className="space-y-10 py-16 sm:py-20">
      <SectionHeading id="blog-title" label={t("label")} title={t("title")} subtitle={t("description")} />
      {posts.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-labelledby="blog-title">
          {posts.map((post) => (
            <li key={post.slug}>
              <article
                lang={post.locale}
                className="group relative flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-6 transition-colors focus-within:border-primary-ink hover:border-primary-ink"
              >
                <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                  <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
                  {post.locale !== locale && (
                    <span lang={locale} className="rounded-sm border border-border px-1.5 py-px">
                      {t(`languages.${post.locale}`)}
                    </span>
                  )}
                </p>
                <h2 className="text-xl font-semibold text-balance">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:underline"
                  >
                    {post.title}
                  </Link>
                </h2>
                <p className="flex-1 text-sm text-muted-foreground">{post.description}</p>
                <span
                  lang={locale}
                  aria-hidden
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink"
                >
                  {t("readMore")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </article>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
