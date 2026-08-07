# BookCli 使用文档

BookCli 是一个面向 Markdown 书本项目的构建工具。它使用一本书目录下的 `config.json` 读取书名、章节、样式和插件配置，然后把章节正文合并为 `dist/book.md`，并生成同名 HTML 与 PDF。

## 安装

进入 BookCli 目录安装依赖：

```bash
cd ./BookCli
npm install
```

本地使用时可以通过 `node bin/book-cli.js` 运行，也可以在当前目录执行：

```bash
npm link
```

之后全局可用 `book-cli` 命令。

## 创建一本新书

```bash
book-cli init my-book --title "我的书" --author "作者名"
```

生成结构如下：

```text
my-book/
  config.json
  chapters/
    01-introduction/
      ideas.md
      outline.md
      content.md
```

`ideas.md` 和 `outline.md` 只用于写作过程，不参与构建。真正参与构建的是 `config.json` 中声明的章节文件，默认是每章目录下的 `content.md`。
`dist/` 会在首次构建时自动创建。

## 构建

在书本目录内构建：

```bash
book-cli build
```

在任意目录构建指定书本：

```bash
book-cli build --book ./my-book
```

只生成 Markdown：

```bash
book-cli build-md --book ./my-book
```

生成 Markdown 和 HTML：

```bash
book-cli build-html --book ./my-book
```

生成 Markdown、HTML 和 PDF：

```bash
book-cli build-pdf --book ./my-book
```

生成 Markdown、HTML 和 EPUB：

```bash
book-cli build-epub --book ./my-book
```

`build` 等价于 `build-pdf`。

## 本地预览

启动 HTML 预览服务：

```bash
book-cli serve --book ./my-book --port 3000
```

`preview` 是 `serve` 的别名：

```bash
book-cli preview --book ./my-book
```

服务启动时会先执行一次 `build-html`，然后监听 `config.json`、`chapters/` 和 `assets/`。修改文件后会自动重建 HTML，并通知浏览器刷新。监听器会在运行期间自动发现新建的章节和资源子目录，无需重启预览服务。

查看 CLI 版本：

```bash
book-cli --version
```

清理构建产物：

```bash
book-cli clean --book ./my-book
```

该命令会删除书本目录下的 `dist/`。

## 添加章节

创建新章节并更新 `config.json`：

```bash
book-cli add-chapter --book ./my-book --title "新章节标题"
```

指定章节目录名：

```bash
book-cli add-chapter --book ./my-book --title "新章节标题" --dir 02-new-topic
```

命令会创建 `content.md`、`outline.md` 和 `summary.md`，并把章节追加到 `config.json` 的章节列表末尾。
如果新增章节标题与已有章节重复，命令会拒绝创建，以避免目录和 PDF 页眉出现同名章节。

## PDF 页眉字体

当页眉需要显示章节名时，BookCli 会在 PDF 后处理阶段嵌入一个支持中文的字体。如果自动查找失败，可以在 `config.json` 中显式配置字体路径：

```json
{
  "style": {
    "header": {
      "fontPath": "/path/to/NotoSansCJK-Regular.ttc"
    }
  }
}
```

当页眉显示章节名时，BookCli 需要计算每一章对应的 PDF 页码范围。默认策略是 `auto`：优先使用渲染后的 DOM 位置估算，估算失败时再逐章生成临时 PDF 统计页数。可以通过 `style.header.chapterPageRangeStrategy` 调整：

```json
{
  "style": {
    "header": {
      "chapterPageRangeStrategy": "auto"
    }
  }
}
```

可选值：

- `auto`：默认，性能优先，估算失败时自动回退到精确统计。
- `exact`：准确优先，逐章生成临时 PDF 统计页数，构建会更慢。
- `estimate`：只使用 DOM 估算，不做逐章 PDF 回退，适合快速预览。

## 字数统计

统计每个章节的字数：

```bash
book-cli stats --book ./my-book
```

命令会在终端输出章节表格，并生成：

```text
dist/word-stats.json
```

JSON 文件包含书名、总字数、每章字数、中文字符数、英文/数字词数、小节数量和章节文件路径。

只在终端输出 JSON：

```bash
book-cli stats --book ./my-book --json
```

指定统计文件输出路径：

```bash
book-cli stats --book ./my-book --out ./stats.json
```

字数统计口径：

- 中文按 CJK 字符逐字统计。
- 英文和数字按连续单词统计。
- Markdown 代码块、图片链接、普通链接、行内代码和基础 Markdown 标记会被清理后再统计。

## 章节摘要

为每个章节生成摘要：

```bash
book-cli summary --book ./my-book
```

命令会为每个章节目录生成：

```text
chapters/<chapter-dir>/summary.md
```

同时生成整本书的摘要汇总：

```text
dist/chapter-summaries.md
```

指定摘要汇总输出路径：

```bash
book-cli summary --book ./my-book --out ./summaries.md
```

摘要生成逻辑是本地规则生成，不调用大模型：默认抽取章节开头的正文段落作为摘要，并把二级标题作为核心小节列表。它适合生成写作检查和预览用摘要，如果需要出版级摘要，可以在生成后人工编辑每章的 `summary.md`。

## config.json

推荐使用集中式 `config.json` 管理一本书的全部构建配置：

```json
{
  "book": {
    "title": "我的书",
    "subtitle": "副标题",
    "author": "作者名",
    "date": "2026-05-29",
    "identifier": "urn:uuid:00000000-0000-4000-8000-000000000000",
    "headingNumbering": { "enabled": true },
    "chapters": [
      { "dir": "01-introduction", "title": "引言", "file": "content.md" },
      { "dir": "02-chapter", "title": "第二章", "file": "content.md" }
    ]
  },
  "output": {
    "pdfName": "我的书"
  },
  "plugins": {
    "math": { "enabled": true },
    "codeHighlight": { "enabled": true, "theme": "github" }
  },
  "style": {
    "body": {
      "fontSize": "12pt",
      "lineHeight": 1.75,
      "color": "#1f1f1f",
      "backgroundColor": "#ffffff"
    },
    "h1": {
      "fontSize": "22pt",
      "color": "#1f1f1f",
      "borderBottom": "1px solid #dddddd"
    },
    "codeBlock": {
      "backgroundColor": "#f5f5f5",
      "borderRadius": "4px"
    },
    "header": {
      "enabled": true,
      "fontSize": "9pt",
      "color": "#888888",
      "padding": "0 18mm",
      "left": { "source": "chapter" },
      "center": { "source": "book" },
      "right": { "source": "none" }
    },
    "pageNumber": {
      "enabled": true,
      "format": "第 {page} 页 / 共 {total} 页",
      "fontSize": "9pt",
      "color": "#888888",
      "padding": "0 18mm",
      "textAlign": "center"
    }
  }
}
```

字段说明：

- `book.title`：必填，书名，也会作为页眉标题。
- `book.subtitle`：可选，封面副标题。
- `book.author`：可选，封面作者。
- `book.date`：可选，封面日期。
- `book.identifier`：可选，EPUB 的唯一标识符，建议使用 UUID 或稳定 URL。不配置时 BookCli 会根据书名、作者和日期生成稳定标识。
- `book.headingNumbering`：可选，是否给章节和正文标题添加 `1.`、`1.1`、`1.2.1` 这类数字序号。可写成 `true` 或 `{ "enabled": true }`；默认关闭，关闭时章节标题只使用原始标题文本。
- `book.language`：可选，书籍语言代码，默认 `zh-CN`。用于 HTML `lang` 属性、EPUB `dc:language` 和 OPF/XHTML 的 `xml:lang`。
- `book.chapters`：必填，章节数组。`dir` 指向 `chapters` 下的章节目录，`title` 是章节标题，`file` 默认是 `content.md`。
- `output.pdfName`：可选，输出 PDF 文件名。不配置时使用书名。
- `output.htmlName`：可选，输出 HTML 文件名。不配置时使用书名。
- `output.epubName`：可选，输出 EPUB 文件名。不配置时使用书名。
- `output.epubModified`：可选，EPUB `dcterms:modified` 时间。配置固定 ISO 时间后，metadata、ZIP 时间戳和资源顺序保持确定，相同输入会生成字节一致的 EPUB；不配置时使用当前构建时间。
- `plugins.math.enabled`：开启后支持 KaTeX 数学公式。
- `plugins.codeHighlight.enabled`：开启后支持代码高亮。
- `plugins.codeHighlight.theme`：highlight.js 主题名，例如 `github`。
- `style`：可选样式配置，未设置的字段使用默认样式。
- `style.header.enabled`：是否显示 PDF 页眉。
- `style.header.left`、`center`、`right`：页眉左侧、中间、右侧三个区域。每个区域支持 `source`，可选 `none`、`book`、`chapter`、`text`。
- `style.header.*.source`：`book` 显示书名，`chapter` 显示当前章节名，`text` 显示自定义文本。`text` 需要同时配置 `text` 字段，例如 `{ "source": "text", "text": "内部资料" }`。
- `style.header.fontSize`、`color`、`padding`：页眉字号、颜色和内边距。未设置时沿用 `style.headerFooter` 或默认值。
- `style.pageNumber.enabled`：是否显示 PDF 页码，设为 `false` 只关闭页码；页眉由 `style.header.enabled` 控制。
- `style.pageNumber.format`：页码文本模板，支持 `{page}` 当前页、`{total}` 总页数、`{title}` 书名，例如 `Page {page} of {total}`。
- `style.pageNumber.fontSize`、`color`、`padding`、`textAlign`：页码字号、颜色、内边距和对齐方式。未设置时沿用 `style.headerFooter` 或默认值。

## 数学公式与代码高亮

开启数学插件后，可以在 Markdown 中写 KaTeX 公式：

```md
行内公式：$E = mc^2$

块级公式：

$$
f(x) = x^2 + 2x + 1
$$
```

开启代码高亮后，为代码块指定语言：

````md
```ts
const message: string = "hello";
```
````

## 兼容旧配置

BookCli 优先读取 `config.json`。如果没有 `config.json`，会尝试兼容旧结构：

- `book.json`
- `style.json`
- `plugins.json`

新项目建议统一使用 `config.json`。

## 输出文件

构建后输出在书本目录的 `dist` 下：

```text
dist/
  book.md
  我的书.html
  我的书.pdf
```

`book.md` 是合并后的中间文件。HTML 使用 `output.htmlName` 或 `book.title` 命名，PDF 使用 `output.pdfName` 或 `book.title` 命名。

Markdown、HTML、PDF 和 EPUB 会先写入 `dist` 下的临时 staging 目录，全部生成成功后再替换正式产物。`dist/assets` 每次都会由当前正文引用的资源完整替换，因此删除正文图片后不会残留旧资源；构建失败时会保留上一次成功产物。

构建时会先把配置、章节正文、编号结果和资源引用编译成一份共享的中间模型，Markdown、HTML、PDF 和 EPUB 都消费这份模型。EPUB 内部包含独立的 `title.xhtml`，并为每章生成 `chapter-001.xhtml`、`chapter-002.xhtml` 等文件；OPF manifest、spine 和导航目录按 `config.json` 中的章节顺序生成。
