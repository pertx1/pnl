import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Markdown, { type Components } from "react-markdown";
import { Container } from "@/components/marketing/section-heading";
import { formatDate, getAllPosts, getPost } from "../posts";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getAllPosts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date },
  };
}

// Estilos del Markdown con tokens del design system (sin plugin de tipografía).
// react-markdown no renderiza HTML crudo por defecto: el contenido no puede inyectar scripts.
type WithNode<T> = T & { node?: unknown };
/** react-markdown pasa `node` a cada componente; lo quitamos para que no acabe como atributo del DOM. */
function clean<T extends object>(props: WithNode<T>): T {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

const components: Components = {
  h2: (props) => <h2 className="mt-10 mb-3 text-[28px] leading-tight font-medium" {...clean(props)} />,
  h3: (props) => <h3 className="mt-8 mb-2 text-lg font-semibold" {...clean(props)} />,
  p: (props) => <p className="my-4 leading-7 text-foreground/90" {...clean(props)} />,
  ul: (props) => <ul className="my-4 list-disc space-y-2 pl-6 marker:text-primary-ink" {...clean(props)} />,
  ol: (props) => <ol className="my-4 list-decimal space-y-2 pl-6 marker:font-mono marker:text-primary-ink" {...clean(props)} />,
  li: (props) => <li className="leading-7 text-foreground/90" {...clean(props)} />,
  strong: (props) => <strong className="font-semibold text-foreground" {...clean(props)} />,
  a: ({ href = "", ...props }) => {
    const rest = clean(props);
    const external = /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="font-medium text-primary-ink underline underline-offset-2 hover:no-underline"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...rest}
      />
    );
  },
  blockquote: (props) => (
    <blockquote className="my-6 border-l-2 border-warning bg-warning/5 py-2 pl-4 text-muted-foreground" {...clean(props)} />
  ),
  code: (props) => <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]" {...clean(props)} />,
  hr: () => <hr className="my-10 border-border" />,
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const [t, locale] = await Promise.all([getTranslations("landing.blog"), getLocale()]);
  return (
    <Container className="py-12 sm:py-16">
      <article lang={post.locale} className="mx-auto max-w-2xl">
        <Link
          href="/blog"
          lang={locale}
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
        <header className="mt-8 space-y-4 border-b border-border pb-8">
          <p className="label-mono" lang={locale}>
            {t("published")} <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
          </p>
          <h1 className="text-3xl font-bold text-balance sm:text-5xl">{post.title}</h1>
          {post.description && <p className="text-lg text-muted-foreground">{post.description}</p>}
        </header>
        <div className="text-base break-words">
          <Markdown components={components}>{post.content}</Markdown>
        </div>
      </article>
    </Container>
  );
}
