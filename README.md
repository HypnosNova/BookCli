# BookCli

BookCli is a Markdown book builder CLI. It reads a book project from `config.json`, merges chapter files, and generates Markdown, HTML, PDF, and EPUB outputs.

## Quick Start

```bash
npm install
node bin/book-cli.js init my-book --title "My Book" --author "Author"
node bin/book-cli.js build-pdf --book my-book
```

Generated files are written to the book project's `dist/` directory.

## Commands

```bash
node bin/book-cli.js build-md --book ./my-book
node bin/book-cli.js build-html --book ./my-book
node bin/book-cli.js build-pdf --book ./my-book
node bin/book-cli.js build-epub --book ./my-book
node bin/book-cli.js serve --book ./my-book --port 3000
node bin/book-cli.js add-chapter --book ./my-book --title "New Chapter"
```

See [docs/usage.md](docs/usage.md) for full configuration, styling, header, page number, EPUB, preview, and chapter-management documentation.
