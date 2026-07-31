// Journal / blog article loader. Articles live as plain `.md` files
// under content/journal/, with YAML frontmatter for metadata + Markdown
// body. Rendered to HTML at request time (article pages are cached at
// the route level so parse/render cost is amortized across visitors).
//
// Frontmatter shape (see any content/journal/*.md for an example):
//   title: string
//   description: string          — 140-160 char meta description
//   publishedAt: YYYY-MM-DD
//   updatedAt?: YYYY-MM-DD
//   image?: string               — hero image URL for OG + article top
//   author?: string              — display name; defaults to "Modaire"

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const CONTENT_DIR = path.join(process.cwd(), "content", "journal");

export type ArticleFrontmatter = {
    title: string;
    description: string;
    publishedAt: string;         // ISO date
    updatedAt?: string;          // ISO date
    image?: string;
    author?: string;
};

export type Article = ArticleFrontmatter & {
    slug: string;
    /** Raw markdown body — for excerpting, indexing, etc. */
    rawBody: string;
    /** Rendered HTML for the body. */
    html: string;
};

/**
 * List every article slug on disk. Cheap — just a directory read.
 * Used by generateStaticParams + the sitemap.
 */
export function listArticleSlugs(): string[] {
    if (!fs.existsSync(CONTENT_DIR)) return [];
    return fs
        .readdirSync(CONTENT_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Load + parse + render one article. Returns null when the file
 * doesn't exist so the route can 404 cleanly.
 */
export async function getArticle(slug: string): Promise<Article | null> {
    const filePath = path.join(CONTENT_DIR, `${slug}.md`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    const frontmatter = parsed.data as Partial<ArticleFrontmatter>;
    if (!frontmatter.title || !frontmatter.description || !frontmatter.publishedAt) {
        // Bad frontmatter — treat as not-found rather than crash the
        // request; broken articles shouldn't 500 the whole /journal.
        return null;
    }
    const html = await marked.parse(parsed.content, { async: true });
    return {
        slug,
        title: frontmatter.title,
        description: frontmatter.description,
        publishedAt: frontmatter.publishedAt,
        updatedAt: frontmatter.updatedAt,
        image: frontmatter.image,
        author: frontmatter.author,
        rawBody: parsed.content,
        html,
    };
}

/**
 * Load every article's metadata (not body). Used by the /journal
 * index page. Sorted newest-first by publishedAt.
 */
export async function listArticles(): Promise<Article[]> {
    const slugs = listArticleSlugs();
    const articles = await Promise.all(slugs.map((s) => getArticle(s)));
    return articles
        .filter((a): a is Article => a !== null)
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
