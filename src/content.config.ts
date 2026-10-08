import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Each story is a Markdown file in src/content/noticias/ (body is the story's HTML).
// scripts/import-wp.mjs writes this same shape from the WordPress export; keep both in sync.
// Field names mirror NotiCel's WordPress data so the app feed and archive import map one to one.
const noticias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/noticias' }),
  schema: z.object({
    wpId: z.number().optional(), // WordPress post id (the app and old ?p= links use it)
    title: z.string(),
    description: z.string().default(''), // WordPress `preview_content`: summary under the headline
    date: z.coerce.date(),
    author: z.string().default('NotiCel'),
    path: z.string(), // the story's address, identical to the old WordPress one
    categories: z.array(z.string()).default([]), // WordPress category slugs (see CATEGORIES in src/lib/site.ts)
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageCaption: z.string().optional(),
    topStory: z.boolean().default(false), // WordPress `is_post_top_stories`
    views: z.number().default(0), // WordPress `post_views_count`, for "Lo más leído"
    pdfUrl: z.string().optional(),
    pdfTitle: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { noticias };
