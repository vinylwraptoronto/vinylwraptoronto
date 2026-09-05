/**
 * The settings /admin/settings/ can change.
 *
 * Declared once, here, and used three ways: the page renders its fields from
 * this, the save route validates against this, and the build merges the stored
 * values over the defaults in src/data/site.ts. A setting added to this list
 * needs no migration and no second edit somewhere else — and a value in the
 * database whose key is not declared here is ignored rather than trusted.
 *
 * These are not cosmetic. The phone number, address and email are rendered
 * into the footer, the sticky bar and the JSON-LD of all 1,620 pages, so
 * changing one here changes the whole site at the next build. That is the
 * point; it is also why every field is validated and why blank means "use the
 * default" rather than "publish an empty footer".
 */
import { site } from '../data/site';

export type SettingKind = 'text' | 'email' | 'tel' | 'url' | 'select' | 'longtext' | 'imagepath';

export interface SettingField {
  key: string;
  label: string;
  kind: SettingKind;
  /** What the site uses when this has never been set. */
  fallback: string;
  hint?: string;
  maxLength?: number;
  options?: { value: string; label: string }[];
  /** Rendered on the page but not editable — shown so the value is findable. */
  readOnly?: boolean;
}

export interface SettingGroup {
  id: string;
  title: string;
  blurb: string;
  fields: SettingField[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'business',
    title: 'Business details',
    blurb:
      'These appear in the footer, the sticky call bar and the structured data on every page. ' +
      'A change here changes all 1,620 pages at the next build.',
    fields: [
      { key: 'business_name', label: 'Business name', kind: 'text', fallback: site.name, maxLength: 120 },
      {
        key: 'phone',
        label: 'Phone number',
        kind: 'tel',
        fallback: site.phone,
        maxLength: 40,
        hint: 'Shown in the header, the footer and the sticky bar, and used for the call link.',
      },
      { key: 'email', label: 'Email address', kind: 'email', fallback: site.email, maxLength: 160 },
      {
        key: 'address',
        label: 'Shop address',
        kind: 'text',
        fallback: site.address,
        maxLength: 200,
        hint: 'One line, as it should read in the footer.',
      },
      {
        key: 'map_url',
        label: 'Map link',
        kind: 'url',
        fallback: site.mapUrl,
        maxLength: 400,
        hint: 'Where the address links to.',
      },
      {
        key: 'site_url',
        label: 'Site address',
        kind: 'url',
        fallback: site.url,
        readOnly: true,
        hint: 'Every canonical URL is built from this. Changing it is a domain move, not a setting.',
      },
    ],
  },
  {
    id: 'blog',
    title: 'Blog defaults',
    blurb: 'What a new post starts with. Each can still be changed per post.',
    fields: [
      {
        key: 'default_post_status',
        label: 'New posts start as',
        kind: 'select',
        fallback: 'draft',
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'published', label: 'Published' },
        ],
      },
      {
        key: 'default_schema_type',
        label: 'Structured data type',
        kind: 'select',
        fallback: 'BlogPosting',
        options: [
          { value: 'BlogPosting', label: 'BlogPosting' },
          { value: 'Article', label: 'Article' },
          { value: 'NewsArticle', label: 'NewsArticle' },
        ],
      },
      {
        key: 'default_author',
        label: 'Default byline',
        kind: 'text',
        fallback: '',
        maxLength: 120,
        hint: 'The author name preselected on a new post. Leave blank for none.',
      },
      {
        key: 'seo_title_suffix',
        label: 'SEO title suffix',
        kind: 'text',
        fallback: '',
        maxLength: 60,
        hint: 'Appended to a new post’s SEO title, e.g. " - Vinyl Wrap Toronto". Counts toward the 60-character limit.',
      },
      {
        key: 'default_social_image',
        label: 'Fallback social image',
        kind: 'imagepath',
        fallback: '',
        maxLength: 400,
        hint: 'Used when a post has no featured image. A path like /wp-content/uploads/2022/12/example.webp',
      },
    ],
  },
];

export const FIELDS: SettingField[] = SETTING_GROUPS.flatMap((g) => g.fields);
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** A complaint about the value, or null when it is acceptable. */
export function validate(key: string, value: string): string | null {
  const field = BY_KEY.get(key);
  if (!field) return 'Unknown setting.';
  if (field.readOnly) return 'That setting cannot be changed here.';

  const v = value.trim();
  if (!v) return null; // blank is allowed and means "use the default"
  if (field.maxLength && v.length > field.maxLength) {
    return `${field.label} is longer than ${field.maxLength} characters.`;
  }

  switch (field.kind) {
    case 'email':
      // Deliberately loose. The only failure that matters is a value that is
      // plainly not an address; a strict pattern rejects valid ones.
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)) return 'That does not look like an email address.';
      break;
    case 'url':
      if (!/^https?:\/\/[^\s]+$/i.test(v)) return 'That must be a full http:// or https:// address.';
      break;
    case 'tel':
      if (!/^[0-9+()\-.\s]{7,40}$/.test(v)) return 'That does not look like a phone number.';
      break;
    case 'imagepath':
      if (!v.startsWith('/wp-content/uploads/')) {
        return 'That must be an image path beginning /wp-content/uploads/.';
      }
      break;
    case 'select':
      if (!field.options?.some((o) => o.value === v)) return 'That is not one of the choices.';
      break;
    default:
      // Control characters would break the markup they are rendered into.
      if (/[\u0000-\u001f\u007f]/.test(v)) return 'That contains characters that are not allowed.';
  }
  return null;
}

/* The shape src/lib/adminroute.ts hands around; declared structurally so this
   module stays free of a D1 import. */
interface Db {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<{ results: T[] }> };
    all<T>(): Promise<{ results: T[] }>;
  };
}

export async function readSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const row of rows.results) {
    // An undeclared key is ignored: the table is a store, not an authority.
    if (BY_KEY.has(row.key)) out[row.key] = row.value;
  }
  return out;
}

/** The value in force: what is stored, or the default when nothing is. */
export function effective(stored: Record<string, string>, key: string): string {
  const field = BY_KEY.get(key);
  if (!field) return '';
  const value = (stored[key] ?? '').trim();
  return value || field.fallback;
}

export async function writeSettings(
  db: Db,
  values: Record<string, string>,
  userId: number,
): Promise<void> {
  for (const [key, raw] of Object.entries(values)) {
    const field = BY_KEY.get(key);
    if (!field || field.readOnly) continue;
    const value = raw.trim();
    if (!value) {
      // Cleared means "go back to the default", so the row goes rather than
      // storing an empty string that would render as an empty footer line.
      await db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
      continue;
    }
    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(key, value, userId)
      .run();
  }
}
