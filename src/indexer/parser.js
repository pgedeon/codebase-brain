import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Parser = require('web-tree-sitter');
import { CONFIG } from '../config.js';

/**
 * Tree-sitter parser manager
 * Loads grammars on demand and caches parsers by language
 */
export class ParserManager {
  constructor() {
    this.parserCache = new Map();
    this.languageCache = new Map();
    this.initialized = false;
    this.Language = null;
  }

  async init() {
    if (this.initialized) return;
    await Parser.init();
    this.Language = Parser.Language; // Now available after init
    this.initialized = true;
  }

  async getParser(lang) {
    await this.init();
    if (this.parserCache.has(lang)) {
      return this.parserCache.get(lang);
    }

    const language = await this.getLanguage(lang);
    const parser = new Parser();
    parser.setLanguage(language);
    this.parserCache.set(lang, parser);
    return parser;
  }

  async getLanguage(lang) {
    if (this.languageCache.has(lang)) {
      return this.languageCache.get(lang);
    }

    // Map our language names to tree-sitter language names
    const langMap = {
      javascript: 'javascript',
      typescript: 'typescript',
      python: 'python',
    };

    const tsLang = langMap[lang];
    if (!tsLang) {
      throw new Error(`Unsupported language: ${lang}. Add to CONFIG.LANGUAGES first.`);
    }

    try {
      if (!this.Language) {
        throw new Error('Parser not initialized. Call init() first.');
      }
      const language = await this.Language.load(require.resolve(`web-tree-sitter/${tsLang}.wasm`));
      this.languageCache.set(lang, language);
      return language;
    } catch (err) {
      console.error(`Failed to load tree-sitter grammar for ${lang}:`, err.message);
      throw err;
    }
  }

  /**
   * Parse source code and extract symbols
   */
  async parseSource(code, filePath, lang) {
    const parser = await this.getParser(lang);
    const tree = parser.parse(code);

    const symbols = [];
    const refs = [];
    const imports = [];

    this.traverse(tree.rootNode, {
      onSymbol: (node) => {
        const symbol = this.extractSymbol(node, filePath, lang);
        if (symbol) {
          symbols.push(symbol);
        }
      },
      onRef: (node) => {
        const ref = this.extractRef(node, filePath);
        if (ref) {
          refs.push(ref);
        }
      },
      onImport: (node, lang) => {
        const imp = this.extractImport(node, filePath, lang);
        if (imp) {
          imports.push(imp);
        }
      },
    });

    return { tree, symbols, refs, imports };
  }

  /**
   * Walk AST and dispatch to handlers based on node type
   */
  traverse(rootNode, handlers) {
    const visit = (node) => {
      const type = node.type;

      // Symbol definitions (language-specific)
      if (['function_declaration', 'class_declaration', 'method_definition', 'variable_declaration'].includes(type)) {
        handlers.onSymbol?.(node);
      }

      // Identifier references (potential symbol usage)
      if (type === 'identifier') {
        handlers.onRef?.(node);
      }

      // Import statements
      if (['import_statement', 'import_declaration', 'import_from'].includes(type)) {
        handlers.onImport?.(node);
      }

      // Recurse children
      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i));
      }
    };

    visit(rootNode);
  }

  /**
   * Extract symbol definition from AST node
   * Language-specific implementations
   */
  extractSymbol(node, filePath, lang) {
    const start = node.startPosition;
    const end = node.endPosition;
    const nameNode = this.findNameNode(node, lang);
    if (!nameNode) return null;

    const name = nameNode.text.trim();
    const kind = this.kindFromNodeType(node.type, lang);

    // Build signature (best-effort)
    const signature = this.buildSignature(node, lang);

    // Container (for methods)
    let containerId = null;
    let parent = node.parent;
    while (parent) {
      if (parent.type.includes('class') || parent.type.includes('object')) {
        const parentName = this.findNameNode(parent, lang);
        if (parentName) {
          containerId = `${lang}_${filePath}_${parent.startPosition.row}_${parent.startPosition.column}`;
        }
        break;
      }
      parent = parent.parent;
    }

    return {
      id: `${lang}_${filePath}_${start.row}_${start.column}`,
      name,
      kind,
      lang,
      file: filePath,
      start_line: start.row + 1,
      start_col: start.column,
      end_line: end.row + 1,
      end_col: end.column,
      signature,
      container_id: containerId,
    };
  }

  findNameNode(node, lang) {
    // Common patterns: identifier child, name property, etc.
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier' || child.type === 'property_identifier') {
        return child;
      }
      // For TypeScript/JavaScript: look for name in specific positions
      if (lang === 'typescript' || lang === 'javascript') {
        if (child.type === 'class' || child.type === 'function') {
          for (let j = 0; j < child.childCount; j++) {
            const nested = child.child(j);
            if (nested.type === 'identifier') {
              return nested;
            }
          }
        }
      }
    }
    return null;
  }

  kindFromNodeType(type, lang) {
    if (type.includes('function')) return 'function';
    if (type.includes('class')) return 'class';
    if (type.includes('method')) return 'method';
    if (type.includes('variable')) return 'variable';
    if (type.includes('interface')) return 'interface';
    if (type.includes('type') || type.includes('enum')) return 'type';
    return 'unknown';
  }

  buildSignature(node, lang) {
    // Simplified signature capture
    // For v1, just return the name and maybe parameter count
    const name = this.findNameNode(node, lang);
    if (!name) return null;

    // Count parameters (best-effort)
    let paramCount = 0;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'formal_parameters' || child.type === 'parameter_list') {
        paramCount = child.childCount;
        break;
      }
    }

    return `${name.text}(${paramCount} params)`;
  }

  /**
   * Extract reference from identifier node
   */
  extractRef(node, filePath) {
    return {
      symbol_name: node.text.trim(),
      file: filePath,
      line: node.startPosition.row + 1,
      col: node.startPosition.column,
      context: null, // could extract surrounding text if needed
      evidence: 'identifier',
    };
  }

  /**
   * Extract import statement
   */
  extractImport(node, filePath, lang) {
    // Simplified: grab the string literal after 'from' or at end of import
    let importPath = null;
    let importKind = 'module';

    if (lang === 'python') {
      const fromNode = node.children.find(c => c.type === 'from');
      const dottedName = node.children.find(c => c.type === 'dotted_name' || c.type === 'import_name');
      if (dottedName) {
        importPath = dottedName.text;
      }
    } else if (lang === 'typescript' || lang === 'javascript') {
      // import x from 'y'; or import 'y';
      const stringLit = node.children.find(c => c.type === 'string' || c.type === 'string_fragment');
      if (stringLit) {
        importPath = stringLit.text.replace(/^['"]|['"]$/g, '');
      }
    }

    if (importPath) {
      return {
        file: filePath,
        import_path: importPath,
        resolved_file: null,
        import_kind: importKind,
      };
    }

    return null;
  }
}
