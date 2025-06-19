# MCP PDF Modesty Server

An MCP (Model Context Protocol) server that provides PDF text extraction capabilities by wrapping the excellent [pdf2json](https://github.com/modesty/pdf2json) library.

## Attribution

This project uses the **pdf2json** library created by Modesty Zhang. The original library can be found at:
- GitHub: https://github.com/modesty/pdf2json
- npm: https://www.npmjs.com/package/pdf2json

All PDF parsing functionality is provided by pdf2json. This project simply wraps it in an MCP server interface.

## Features

- Extract text content from PDF files
- Extract form fields from PDF files
- Multiple output formats: plain text, JSON, or detailed metadata
- Zero-dependency PDF parsing (inherited from pdf2json v3.1.6+)

## Installation

```bash
npm install mcp-pdf-modesty
```

## Usage

### In Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pdf": {
      "command": "npx",
      "args": ["mcp-pdf-modesty"]
    }
  }
}
```

### Available Tools

#### extract_text
Extract text content from a PDF file.

Parameters:
- `path` (required): Path to the PDF file
- `format` (optional): Output format
  - `"text"` (default): Plain text output
  - `"json"`: Structured data with text and metadata
  - `"detailed"`: Full PDF data structure

Example:
```
extract_text({ path: "/path/to/document.pdf", format: "text" })
```

#### extract_form_fields
Extract form fields from a PDF file.

Parameters:
- `path` (required): Path to the PDF file

Example:
```
extract_form_fields({ path: "/path/to/form.pdf" })
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

## License

This MCP wrapper is licensed under the MIT License. See [LICENSE](LICENSE) file for details.

The underlying pdf2json library has its own license. Please refer to the [pdf2json repository](https://github.com/modesty/pdf2json) for its licensing terms.

## Acknowledgments

Special thanks to Modesty Zhang for creating and maintaining the pdf2json library that makes this MCP server possible.