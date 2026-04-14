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

/**
 * All blocks for the test page, organized in sections.
 * Each section tests a different block type or scenario.
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

    // Section 12: Mixed content (stress test)
    heading2("Section 12: Mixed content"),
    paragraph("Normal text"),
    bulletedList("Bullet in mixed"),
    todo("Todo in mixed"),
    emptyParagraph(),
    paragraph("Text with special chars: ()[]{}\"'`<>/*"),
    numberedList("Number in mixed"),
    quote("Quote in mixed"),
    paragraph("Final line of test page"),
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

  // Add nested children for indent testing
  await addNestedChildren(apiKey, page.id);

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
