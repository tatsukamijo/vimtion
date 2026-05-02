# E2E テスト引き継ぎ資料

**作成日**: 2026-04-17
**ブランチ**: `feat/e2e_test`
**最新コミット**: `115ce38` (chore(test): integrate Notion API for systematic E2E test environment setup)

---

## 1. 現状サマリ

### テスト規模
- **391 E2Eテスト** (11 spec files) + 2 setup tests = 393 total
- 直近のフルスイート結果: **380 passed, 2 failed (flaky), 1 skipped, 10 did not run** (12.4m)

### 未コミットの変更
全て `feat/e2e_test` ブランチ上。ステージングもコミットもまだ。

**Modified:**
- `docs/known-bugs.md` — BUG-010〜BUG-013 追加
- `test/e2e/navigation.spec.ts` — 49→47テスト（リファクタ）
- `test/helpers.ts` — `getActualCursorBlockIndex`, `getActualCursorBlockText`, `getDOMCursorOffset` 追加
- `test/setup-test-page.ts` — Notion API経由のテストページ自動生成

**New:**
- `test/e2e/cross-block-types.spec.ts` — 170テスト、全ブロックタイプ×基本操作のsystematicテスト
- `test/e2e/code-block-nav.spec.ts` — 17テスト、コードブロック内ナビゲーション
- `test/e2e/insert-open-line.spec.ts` — 30テスト、o/O/I/A + BUG-013検証
- `test/e2e/operator-motions.spec.ts` — 32テスト、d/c/y + motion/text object
- `test/e2e/operators-block-types.spec.ts` — 16テスト、V+d/yy+p/dwの全ブロックタイプ
- `test/e2e/undo-redo.spec.ts` — 15テスト、u/r + V+d+u
- `docs/e2e-test-catalog.md` — 全テスト一覧（ステータス付き）
- `docs/missing-features.md` — 未実装Vim操作19件

---

## 2. テストアーキテクチャ

### ディレクトリ構成
```
test/
  playwright.config.ts    # 2プロジェクト: setup + e2e, workers:1
  global-setup.ts         # Notionログイン + テストページ生成(Notion API)
  fixtures.ts             # Chrome拡張ロード済みカスタムfixture
  helpers.ts              # 共通ヘルパー関数
  setup-test-page.ts      # Notion API経由テストページ構築
  .env                    # NOTION_TEST_PAGE_URL, NOTION_API_KEY
  auth/.user-data/        # Chromeプロファイル
  e2e/                    # specファイル群
```

### 重要なヘルパー関数 (`test/helpers.ts`)
| 関数 | 用途 |
|------|------|
| `navigateToTestPage(page)` | テストページ遷移 + vim_info待ち |
| `getVimState(page)` | `window.vim_info` から mode, active_line 等取得 |
| `getCursorPosition(page)` | ステータスバーから line, col パース |
| `getActualCursorBlockIndex(page)` | DOM `window.getSelection()` から実際のカーソルブロックindex取得 |
| `getActualCursorBlockText(page)` | DOM選択位置のブロックテキスト取得 |
| `getDOMCursorOffset(page)` | TreeWalkerでDOM内のカーソルオフセット取得 |
| `pressKeys(page, ...keys)` | キー入力（50ms間隔） |
| `goToBlock(page, targetText)` | 各specで定義、gg→jで特定ブロックまで移動 |

### テスト実行
```bash
npm test                                                    # フルスイート（〜12分）
npx playwright test --config test/playwright.config.ts <file>  # 個別ファイル
npm run test:setup-auth                                     # 初回Notionログイン
```

### テストページ構造
`test/setup-test-page.ts` がNotion APIで自動生成。内容:
- Plain text line 1〜5（基本操作テスト用）
- Heading 1/2/3
- Bullet（ネスト含む）、Numbered list
- Todo（ネスト含む、checked/unchecked）
- Quote、Callout、Toggle
- Code block（複数行）
- Divider前後のテキスト
- 特殊文字テスト行（`find char: abcdefghij` 等）
- Empty line

---

## 3. 既知バグ一覧 (`docs/known-bugs.md`)

### 自動テストで確認済み（test.fail()マーク済み）

| ID | 概要 | 深刻度 | テストファイル |
|----|------|--------|----------------|
| BUG-003 | o→type→Esc→k で1行ズレる | High | insert-open-line, stress-fast-user |
| BUG-004 | h at col 0 でDOM選択がズレる | Medium | navigation |
| BUG-005 | $ が length-1 ではなく length に移動 | Medium | navigation |
| BUG-006 | F, T（後方文字検索）が動かない | Medium | navigation |
| BUG-007 | {, }（段落移動）が動かない | Medium | navigation |
| BUG-008 | I, A がカーソル移動せず挿入（自動テストのみ） | Medium | navigation, insert-open-line |
| BUG-009 | O が上ではなく下に行を作る（自動テストのみ） | Medium | navigation, insert-open-line |
| BUG-010 | j でコードブロック最終行→ゴースト行→スタック | High | code-block-nav |
| BUG-011 | o がコードブロック内で改行を挿入しない（自動テストのみ） | Medium | code-block-nav |
| BUG-013 | ## / - / > + Enter + Esc で active_line が1ズレる | **High** | insert-open-line |

### 手動で再現するが自動テストは通る（タイミング依存）

| ID | 概要 | 根本原因 |
|----|------|----------|
| BUG-001 | 高速j/k往復でDOMカーソルがズレる | undo後の状態でrapidナビ |
| BUG-002 | コードブロック上のheadingをI→type→Escでk先がズレる | insert後のvim_info mapping |
| BUG-012 | ``` でコードブロック作成→Escでカーソルが飛ぶ | refreshLinesのelement参照消失 |

### BUG-013 根本原因（最重要）
`src/content_scripts/core/line-management.ts:120-128` の `refreshLines`:
```typescript
if (currentActiveElement) {
  const newIndex = vim_info.lines.findIndex(
    (line) => line.element === currentActiveElement,
  );
  if (newIndex !== -1) {
    vim_info.active_line = newIndex;  // OK
  }
  // BUG: newIndex === -1 のとき active_line がstaleのまま
}
```
Notionがmarkdownショートカット（`##`, `-`, `>`, `` ``` ``）でブロックタイプを変換すると、元の `contenteditable` 要素がDOMから破棄される。`findIndex` が `-1` を返し、`active_line` が古い値のまま残る。

---

## 4. フルスイート結果の読み方

### 常時2件のflaky failure
1. **`code-block-nav: j on ghost line exits code block`** — BUG-010関連、フルスイートで前のテストのコードブロック状態が残ると失敗
2. **`stress-fast-user: rapid 20j/20k`** or **`navigate around divider`** — タイミング依存で交互に出る

これらはバグ自体は既知。テストを `test.fail()` にしていないのは、単体実行だと通ることがあるため。

### test.fail() でマークしているバグテスト
`test.fail()` = 「失敗することを期待」→ 実際に失敗すれば passed 扱い、成功すると failed 扱い。
- BUG-003, 004, 005, 006, 007, 008, 009, 010, 011, 013 の各テスト

---

## 5. 次にやるべきこと

### 即座（このブランチ）
1. **未コミット変更をコミット** — ファイルは全てステージング待ち。ユーザは `gc` コマンドでコミットする
2. **PRを `main` に作成** — テストインフラ + 391テスト + バグドキュメント

### 短期
3. **BUG-013の修正** — `refreshLines` で element が見つからない場合、`window.getSelection()` のanchorNodeを使ってactive_lineを推定する
4. **BUG-010の修正** — `moveCursorDown/UpInCodeBlock` のexit pathで `setActiveLine()` / `updateInfoContainer()` を呼ぶ
5. **BUG-005の修正** — `jumpToLineEnd()` で `lineLength - 1` にする（1行修正）

### 中期
6. **cross-block-types.spec.ts の `w advances on plain text` flaky対策** — タイミング調整かリトライ追加
7. **missing-features.md の優先度高い機能実装** — MISSING-001(数字prefix), MISSING-005(visual c), MISSING-007(dot repeat), MISSING-009(検索)

---

## 6. ユーザの好み・注意点

- **コミット**: ユーザは `gc` コマンドを使う。ファイルをstageしてユーザに `gc` を促す
- **テスト哲学**: 「テストはバグを見つけるためのもの。失敗するテストの方がgreenより価値がある」
- **テストカバレッジ**: plain textだけでなく、全ブロックタイプでsystematicにテスト
- **バグ記録**: テスト作業中に見つけたバグは `docs/known-bugs.md` に詳細記録（再現手順、根本原因、影響範囲）
- **カタログ更新**: テスト追加・変更時は `docs/e2e-test-catalog.md` も必ず更新
- **インクリメンタル**: 大きな変更は段階的に。各ステップで動作確認→コミット

---

## 7. 主要ファイルパス

| ファイル | 役割 |
|----------|------|
| `src/content_scripts/vim.ts` | コアVim実装（6000行超） |
| `src/content_scripts/core/line-management.ts` | refreshLines, active_line管理 |
| `src/content_scripts/navigation/code-block.ts` | コードブロック内ナビゲーション |
| `src/content_scripts/navigation/basic.ts` | 基本ナビゲーション（hjkl, w/b/e等） |
| `test/helpers.ts` | テスト共通ヘルパー |
| `test/setup-test-page.ts` | テストページ自動生成 |
| `docs/known-bugs.md` | バグ一覧（BUG-001〜013） |
| `docs/e2e-test-catalog.md` | テスト一覧（391件） |
| `docs/missing-features.md` | 未実装機能（MISSING-001〜019） |
