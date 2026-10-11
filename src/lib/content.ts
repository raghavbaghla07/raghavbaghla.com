export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};
export type Attachment = { name: string; url: string; size: number };
export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  color: string;
  content: RichNode;
  cover_url: string | null;
  attachments: Attachment[];
  published: boolean;
  created_at: string;
};
export type PostSummary = Pick<
  Post,
  | "id"
  | "slug"
  | "title"
  | "excerpt"
  | "category"
  | "color"
  | "cover_url"
  | "created_at"
>;
export const categories = [
  "Ad copy",
  "Social posts",
  "Campaign concepts",
  "Notes",
];
export const colors = ["peach", "lavender", "lime", "blue"];
export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export function safeUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
const paragraph = (text: string): RichNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
export const samples: Post[] = [
  {
    id: "sample-coffee",
    slug: "a-little-less-scroll-a-little-more-sip",
    title: "A little less scroll.\nA little more sip.",
    excerpt: "A small reminder to put your phone down and your coffee first.",
    category: "Ad copy",
    color: "peach",
    content: {
      type: "doc",
      content: [
        paragraph(
          "Illustrative concept · Coffee category · Self-initiated work",
        ),
        paragraph("A little less scroll. A little more sip."),
        paragraph("Your feed can wait. Your coffee shouldn’t."),
        paragraph(
          "The idea: turn an everyday coffee break into a moment of presence. A short headline, a familiar habit, and an invitation to slow down.",
        ),
      ],
    },
    cover_url: null,
    attachments: [],
    published: true,
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "sample-weekend",
    slug: "out-of-office-into-yourself",
    title: "Out of office.\nInto yourself.",
    excerpt:
      "A weekend escape, told in four words and a change of perspective.",
    category: "Campaign concepts",
    color: "lavender",
    content: {
      type: "doc",
      content: [
        paragraph(
          "Illustrative concept · Travel category · Self-initiated work",
        ),
        paragraph("Out of office. Into yourself."),
        paragraph(
          "Some journeys don’t need an itinerary. Just a little room to breathe.",
        ),
        paragraph(
          "The idea: focus on how a getaway feels, rather than listing everything a destination has. The campaign could extend into quiet, expressive social posts.",
        ),
      ],
    },
    cover_url: null,
    attachments: [],
    published: true,
    created_at: "2026-10-02T00:00:00Z",
  },
  {
    id: "sample-running",
    slug: "your-own-kind-of-fast",
    title: "Your pace.\nYour kind of fast.",
    excerpt: "A social post for everyone who shows up, even on the slow days.",
    category: "Social posts",
    color: "lime",
    content: {
      type: "doc",
      content: [
        paragraph(
          "Illustrative concept · Fitness category · Self-initiated work",
        ),
        paragraph("Your pace. Your kind of fast."),
        paragraph(
          "A personal best isn’t always a number. Sometimes it’s getting out the door.",
        ),
        paragraph(
          "The idea: celebrate consistency over comparison. An encouraging caption for a community that runs for its own reasons.",
        ),
      ],
    },
    cover_url: null,
    attachments: [],
    published: true,
    created_at: "2026-10-03T00:00:00Z",
  },
];
