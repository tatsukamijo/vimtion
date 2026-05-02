/**
 * Creates a comprehensive test page via Notion API with all block types
 * that Vimtion handles. Run from global-setup before tests.
 */

const NOTION_API_URL = "https://api.notion.com";
const NOTION_VERSION = "2022-06-28";

interface NotionBlock {
  object: "block";
  type: string;
  [key: string]: unknown;
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function richText(content: string, annotations?: Record<string, boolean>) {
  return [
    {
      type: "text",
      text: { content },
      ...(annotations ? { annotations } : {}),
    },
  ];
}

function paragraph(text: string): NotionBlock {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(text) },
  };
}

function emptyParagraph(): NotionBlock {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [] },
  };
}

function heading1(text: string): NotionBlock {
  return {
    object: "block",
    type: "heading_1",
    heading_1: { rich_text: richText(text) },
  };
}

function heading2(text: string): NotionBlock {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: richText(text) },
  };
}

function heading3(text: string): NotionBlock {
  return {
    object: "block",
    type: "heading_3",
    heading_3: { rich_text: richText(text) },
  };
}

function bulletedList(text: string): NotionBlock {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText(text) },
  };
}

function numberedList(text: string): NotionBlock {
  return {
    object: "block",
    type: "numbered_list_item",
    numbered_list_item: { rich_text: richText(text) },
  };
}

function todo(text: string, checked = false): NotionBlock {
  return {
    object: "block",
    type: "to_do",
    to_do: { rich_text: richText(text), checked },
  };
}

function quote(text: string): NotionBlock {
  return {
    object: "block",
    type: "quote",
    quote: { rich_text: richText(text) },
  };
}

function callout(text: string): NotionBlock {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: richText(text),
      icon: { type: "emoji", emoji: "💡" },
    },
  };
}

function codeBlock(content: string, language = "plain text"): NotionBlock {
  return {
    object: "block",
    type: "code",
    code: { rich_text: richText(content), language },
  };
}

function divider(): NotionBlock {
  return {
    object: "block",
    type: "divider",
    divider: {},
  };
}

function equation(expression: string): NotionBlock {
  return {
    object: "block",
    type: "equation",
    equation: { expression },
  };
}

function toggle(text: string): NotionBlock {
  return {
    object: "block",
    type: "toggle",
    toggle: { rich_text: richText(text) },
  };
}

// ---------------------------------------------------------------------------
// Rich-text segment helpers (for Sections 14–16)
// ---------------------------------------------------------------------------

/** Single text rich-text segment with optional annotations. */
function txt(content: string, annotations?: Record<string, boolean | string>) {
  return {
    type: "text",
    text: { content },
    ...(annotations ? { annotations } : {}),
  };
}

/** Inline date mention. User/page mentions need real IDs we don't have at
 * fixture-build time; date mentions are self-contained and safe. */
function dateMention(start: string) {
  return {
    type: "mention",
    mention: { type: "date", date: { start } },
  };
}

/** Inline equation rich-text segment. */
function inlineEquation(expression: string) {
  return {
    type: "equation",
    equation: { expression },
  };
}

/** Paragraph block from a pre-built rich-text array (decorated / mixed). */
function paragraphRich(richTextArr: unknown[]): NotionBlock {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richTextArr },
  };
}

// ---------------------------------------------------------------------------
// Composite block helpers (for Sections 17, 18, 20)
// ---------------------------------------------------------------------------

/** Toggle block with inline children appended at create time. */
function toggleWithChildren(
  text: string,
  children: NotionBlock[],
): NotionBlock {
  return {
    object: "block",
    type: "toggle",
    toggle: { rich_text: richText(text), children },
  };
}

/** A single column inside a column_list. Must contain ≥1 child. */
function column(children: NotionBlock[]): NotionBlock {
  return {
    object: "block",
    type: "column",
    column: { children },
  };
}

/** A column_list block. Per Notion API, must contain ≥2 columns at create time. */
function columnList(columns: NotionBlock[][]): NotionBlock {
  return {
    object: "block",
    type: "column_list",
    column_list: {
      children: columns.map((c) => column(c)),
    },
  };
}

/** A single table_row. `cells` length must equal the table's `table_width`. */
function tableRow(cells: string[]): NotionBlock {
  return {
    object: "block",
    type: "table_row",
    table_row: {
      cells: cells.map((content) => [txt(content)]),
    },
  };
}

/**
 * A `table` block with rows specified at create time. Notion requires
 * `table_width` to match every row's cell count and at least one child row.
 */
function table(
  rows: string[][],
  hasColumnHeader = true,
  hasRowHeader = false,
): NotionBlock {
  if (rows.length === 0) {
    throw new Error("table() requires at least one row");
  }
  const tableWidth = rows[0].length;
  return {
    object: "block",
    type: "table",
    table: {
      table_width: tableWidth,
      has_column_header: hasColumnHeader,
      has_row_header: hasRowHeader,
      children: rows.map((r) => tableRow(r)),
    },
  };
}

/**
 * All blocks for the test page, organized in sections.
 * Each section tests a different block type or scenario.
 *
 * NOTE: New sections must be APPENDED, not inserted, because existing tests
 * locate blocks by exact text via `goToBlock(...)`. Reordering existing
 * sections would re-index any test that hardcodes a position.
 *
 * Sections 14–20 cover the block-type breadth gap from
 * docs/test-overhaul/env-gaps.md (Gap 4).
 *
 * Section 19 (`child_page`) is created OUT-OF-BAND in `createTestPage()` —
 * the Notion API does not allow `child_page` blocks via append-children.
 * The placeholder paragraph in this array marks the section header in
 * document order; the actual sub-page is appended afterwards.
 */
function buildTestBlocks(): NotionBlock[] {
  return [
    // Section 1: Plain text lines
    heading2("Section 1: Plain text"),
    paragraph("Plain text line 1"),
    paragraph("Plain text line 2"),
    paragraph("Plain text line 3"),
    paragraph("Plain text line 4"),
    paragraph("Plain text line 5"),

    // Section 2: Empty lines between content
    heading2("Section 2: Empty lines"),
    paragraph("Before empty line"),
    emptyParagraph(),
    paragraph("After empty line"),
    emptyParagraph(),
    emptyParagraph(),
    paragraph("After two empty lines"),

    // Section 3: Headings
    heading2("Section 3: Headings"),
    heading1("Heading 1 test"),
    heading2("Heading 2 test"),
    heading3("Heading 3 test"),
    paragraph("Text after heading"),

    // Section 4: Bulleted list
    heading2("Section 4: Bulleted list"),
    bulletedList("Bullet item 1"),
    bulletedList("Bullet item 2"),
    bulletedList("Bullet item 3"),

    // Section 5: Numbered list
    heading2("Section 5: Numbered list"),
    numberedList("Numbered item 1"),
    numberedList("Numbered item 2"),
    numberedList("Numbered item 3"),

    // Section 6: Todo list
    heading2("Section 6: Todo list"),
    todo("Todo unchecked 1"),
    todo("Todo unchecked 2"),
    todo("Todo checked", true),

    // Section 7: Quote and callout
    heading2("Section 7: Quote and callout"),
    quote("This is a quote block"),
    callout("This is a callout block"),

    // Section 8: Code block
    heading2("Section 8: Code block"),
    codeBlock("function hello() {\n  console.log('world');\n  return true;\n}", "javascript"),
    paragraph("Text after code block"),

    // Section 9: Equation / LaTeX
    heading2("Section 9: Equation"),
    equation("E = mc^2"),
    paragraph("Text after equation"),

    // Section 10: Divider
    heading2("Section 10: Divider"),
    paragraph("Before divider"),
    divider(),
    paragraph("After divider"),

    // Section 11: Toggle
    heading2("Section 11: Toggle"),
    toggle("Toggle block"),
    paragraph("Text after toggle"),

    // Section 12: Operator + motion test content
    heading2("Section 12: Operator motions"),
    paragraph("The quick brown fox jumps over the lazy dog"),
    paragraph("hello(world) and [brackets] and {braces} here"),
    paragraph("say 'single' and \"double\" quotes today"),
    paragraph("first/second/third delimited path"),
    paragraph("some *bold* and `code` markup text"),
    paragraph("prefix_WORD_suffix next_WORD end"),
    paragraph("  indented line with leading spaces"),
    paragraph("short"),
    paragraph("delete-me: the rest of this line goes away"),
    paragraph("find char: abcdefghij klmnop"),

    // Section 13: Mixed content (stress test)
    heading2("Section 13: Mixed content"),
    paragraph("Normal text"),
    bulletedList("Bullet in mixed"),
    todo("Todo in mixed"),
    emptyParagraph(),
    paragraph("Text with special chars: ()[]{}\"'`<>/*"),
    numberedList("Number in mixed"),
    quote("Quote in mixed"),
    paragraph("Final line of test page"),

    // Section 14: Decorated text — bold / italic / code / strikethrough / color.
    // Real users have rich text; word-motion (w/b/e) and text-object (ciw / daw)
    // bugs at decoration boundaries are completely untestable on plain text.
    heading2("Section 14: Decorated text"),
    paragraphRich([
      txt("the "),
      txt("quick", { bold: true }),
      txt(" brown "),
      txt("fox", { italic: true }),
      txt(" jumps over "),
      txt("the lazy", { code: true }),
      txt(" dog "),
      txt("strikethrough", { strikethrough: true }),
      txt(" and "),
      txt("colored", { color: "red" }),
      txt(" text"),
    ]),

    // Section 15: Inline mentions. Date mentions are safe (self-contained);
    // user/page mentions need real IDs we don't know at fixture-build time —
    // deferred to a later iteration.
    heading2("Section 15: Inline mentions"),
    paragraphRich([
      txt("Meeting on "),
      dateMention("2026-05-03"),
      txt(" — discuss roadmap"),
    ]),

    // Section 16: Inline equation mixed with prose. Inline LaTeX is rendered
    // by Notion as a non-text inline node, which can break cursor offsets.
    heading2("Section 16: Inline equation"),
    paragraphRich([
      txt("Solve "),
      inlineEquation("x^2 + y^2"),
      txt(" = z^2 for the test"),
    ]),

    // Section 17: Toggle with children. The pre-existing Section 11 toggle is
    // empty. This one has actual children so we can test j/k navigation INTO
    // and OUT OF the open toggle.
    heading2("Section 17: Toggle with children"),
    toggleWithChildren("Toggle with children", [
      paragraph("Toggle child paragraph 1"),
      paragraph("Toggle child paragraph 2"),
      bulletedList("Toggle child bullet"),
    ]),

    // Section 18: Columns. Each column is its own block-tree subtree; in DOM
    // they appear in flow order, so j/k traversal across columns is non-trivial.
    heading2("Section 18: Columns"),
    columnList([
      [
        paragraph("Left column line 1"),
        paragraph("Left column line 2"),
      ],
      [
        paragraph("Right column line 1"),
        paragraph("Right column line 2"),
      ],
    ]),

    // Section 19: Page link / child_page. The actual sub-page is created
    // out-of-band in createTestPage() — see the function for rationale.
    heading2("Section 19: Page link"),
    paragraph(
      "(The child page block follows; created via a separate /v1/pages POST.)",
    ),

    // Section 20: Table. Cells are individual `[contenteditable=true]`
    // elements — Vimtion's `setLines` will pick all of them up. j/k across
    // table cells is critical to test.
    heading2("Section 20: Table"),
    table([
      ["Header 1", "Header 2", "Header 3"],
      ["Row 1 A", "Row 1 B", "Row 1 C"],
      ["Row 2 A", "Row 2 B", "Row 2 C"],
    ]),
  ];
}

async function apiRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${NOTION_API_URL}${path}`, {
    method,
    headers: headers(apiKey),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Append children to a block, batching in groups of 100 (API limit).
 */
async function appendChildren(
  apiKey: string,
  blockId: string,
  children: NotionBlock[],
): Promise<void> {
  for (let i = 0; i < children.length; i += 100) {
    const batch = children.slice(i, i + 100);
    await apiRequest(apiKey, "PATCH", `/v1/blocks/${blockId}/children`, {
      children: batch,
    });
  }
}

/**
 * Add indented children to a specific block (for nested list testing).
 */
async function addNestedChildren(
  apiKey: string,
  parentBlockId: string,
): Promise<void> {
  // Find bullet and todo blocks to add children to
  const response = (await apiRequest(
    apiKey,
    "GET",
    `/v1/blocks/${parentBlockId}/children?page_size=100`,
  )) as { results: Array<{ id: string; type: string; [key: string]: unknown }> };

  for (const block of response.results) {
    // Add nested child to "Bullet item 2"
    if (
      block.type === "bulleted_list_item" &&
      (block.bulleted_list_item as { rich_text: Array<{ plain_text: string }> })
        ?.rich_text?.[0]?.plain_text === "Bullet item 2"
    ) {
      await appendChildren(apiKey, block.id, [
        bulletedList("Nested bullet child 1"),
        bulletedList("Nested bullet child 2"),
      ]);
    }

    // Add nested child to "Todo unchecked 2"
    if (
      block.type === "to_do" &&
      (block.to_do as { rich_text: Array<{ plain_text: string }> })
        ?.rich_text?.[0]?.plain_text === "Todo unchecked 2"
    ) {
      await appendChildren(apiKey, block.id, [
        todo("Nested todo child"),
      ]);
    }
  }
}

/** Brief pause to stay under Notion's ~3 req/s rate limit. */
function rateLimitPause(): Promise<void> {
  return new Promise((r) => setTimeout(r, 350));
}

/**
 * Create a sub-page beneath `parentPageId`. Notion automatically reflects
 * this as a `child_page` block in the parent's content. We use this for
 * Section 19 because `child_page` cannot be appended via /v1/blocks/{id}/children.
 *
 * Position note: the auto-generated `child_page` block is appended to the
 * end of the parent's children at creation time, regardless of where the
 * "Section 19" heading sits. Tests that need to find the sub-page should
 * locate it via class name / data-block-id, not by document position.
 */
async function createSubPage(
  apiKey: string,
  parentPageId: string,
  title: string,
  bodyBlocks: NotionBlock[],
): Promise<{ id: string; url: string }> {
  return (await apiRequest(apiKey, "POST", "/v1/pages", {
    parent: { page_id: parentPageId },
    properties: {
      title: { title: richText(title) },
    },
    children: bodyBlocks,
  })) as { id: string; url: string };
}

export async function createTestPage(
  apiKey: string,
  parentPageId: string,
): Promise<{ pageId: string; url: string }> {
  const page = (await apiRequest(apiKey, "POST", "/v1/pages", {
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: richText(`E2E Test Page ${new Date().toISOString().slice(0, 16)}`),
      },
    },
  })) as { id: string; url: string };

  const blocks = buildTestBlocks();
  await appendChildren(apiKey, page.id, blocks);

  // Rate-limit pause between bulk-write phases.
  await rateLimitPause();

  // Add nested children for indent testing
  await addNestedChildren(apiKey, page.id);

  // Rate-limit pause before the final out-of-band sub-page creation.
  await rateLimitPause();

  // Section 19: out-of-band child page (see comment on createSubPage).
  await createSubPage(apiKey, page.id, "Section 19 child page", [
    paragraph("This is a nested child page used as a page-link target."),
    paragraph("Edit me to test cursor restoration after navigation."),
  ]);

  return { pageId: page.id, url: page.url };
}

export async function deleteTestPage(
  apiKey: string,
  pageId: string,
): Promise<void> {
  await apiRequest(apiKey, "PATCH", `/v1/pages/${pageId}`, {
    archived: true,
  });
}
