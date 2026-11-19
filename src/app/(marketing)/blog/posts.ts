import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string; // AAAA-MM-DD
  locale: "es" | "en";
};
export type Post = PostMeta & { content: string };

const BLOG_DIR = path.join(process.cwd(), "content", "blog");
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Frontmatter simple `clave: valor` entre `---`. Sin YAML completo a propósito. */
function parse(slug: string, raw: string): Post | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return null;
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    data[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  if (!data.title || !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "")) return null;
  return {
    slug,
    title: data.title,
    description: data.description ?? "",
    date: data.date,
    locale: data.locale === "en" ? "en" : "es",
    content: match[2].trim(),
  };
}

export async function getAllPosts(): Promise<Post[]> {
  let files: string[];
  try {
    files = await readdir(BLOG_DIR);
  } catch {
    return [];
  }
  const posts = await Promise.all(
    files
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((slug) => SLUG_RE.test(slug))
      .map(async (slug) => parse(slug, await readFile(path.join(BLOG_DIR, `${slug}.md`), "utf8"))),
  );
  return posts.filter((p): p is Post => p !== null).sort((a, b) => b.date.localeCompare(a.date));
}

/** Solo devuelve slugs que existen en el listado (sin rutas construidas con entrada del usuario). */
export async function getPost(slug: string): Promise<Post | undefined> {
  return (await getAllPosts()).find((p) => p.slug === slug);
}

export function formatDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
