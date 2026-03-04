import { CONFIG } from '../config.js';

// Tree-sitter Parser class (loaded on demand)
let ParserClass = null;
async function getParserClass() {
  if (!ParserClass) {
    const mod = await import('tree-sitter');
    ParserClass = mod.default || mod;
  }
  return ParserClass;
}

// Language imports - will be loaded on demand
const LANGUAGE_MODULES = {
  javascript: () => import('tree-sitter-javascript'),
  typescript: () => import('tree-sitter-typescript'),
  python: () => import('tree-sitter-python'),
};

/**
 * Tree-sitter parser manager
 * Loads grammars on demand and caches parsers by language
 */
export class ParserManager {
  constructor() {
    this.parserCache = new Map();
    this.languageCache = new Map();
  }

  async getParser(lang) {
    if (this.parserCache.has(lang)) {
      return this.parserCache.get(lang);
    }

    const language = await this.getLanguage(lang);
    const Parser = await getParserClass();
    const parser = new Parser();
    parser.setLanguage(language);
    this.parserCache.set(lang, parser);
    return parser;
  }

  async getLanguage(lang) {
    if (this.languageCache.has(lang)) {
      return this.languageCache.get(lang);
    }

    const loader = LANGUAGE_MODULES[lang];
    if (!loader) {
      throw new Error(`Unsupported language: ${lang}. Add to CONFIG.LANGUAGES first.`);
    }

    try {
      let mod = await loader();
      // Handle CommonJS interop: if module has .default, use that
      if (mod && typeof mod === 'object' && 'default' in mod) {
        mod = mod.default;
      }

      // Grammar packages export a wrapper object that contains the grammar metadata and a .language property.
      // parser.setLanguage() expects the whole wrapper, not just .language.
      // We return the appropriate wrapper for the requested language.
      let grammar;
      if (lang === 'typescript') {
        grammar = mod.typescript;
      } else if (lang === 'tsx') {
        grammar = mod.tsx;
      } else {
        grammar = mod;
      }

      if (!grammar) {
        throw new Error(`Grammar module for ${lang} did not export a grammar object`);
      }

      this.languageCache.set(lang, grammar);
      return grammar;
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
      onImport: (node) => {
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
    const { name, kind } = this.analyzeNode(node, lang);

    if (!name) return null;

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
      name: name.trim(),
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

  /**
   * Analyze a node to determine its symbol name and kind
   */
  analyzeNode(node, lang) {
    const type = node.type;

    // TypeScript/JavaScript specific patterns
    if (lang === 'typescript' || lang === 'javascript') {
      // Interface: interface_declaration -> type_identifier
      if (type === 'interface_declaration') {
        const nameNode = node.childForFieldName('name') || this.findChildByType(node, 'type_identifier');
        return { name: nameNode?.text, kind: 'interface' };
      }

      // Class: class_declaration -> type_identifier
      if (type === 'class_declaration') {
        const nameNode = node.childForFieldName('name') || this.findChildByType(node, 'type_identifier');
        return { name: nameNode?.text, kind: 'class' };
      }

      // Method: method_definition -> property_identifier (first)
      if (type === 'method_definition') {
        const nameNode = node.childForFieldName('name') || this.findChildByType(node, 'property_identifier');
        return { name: nameNode?.text, kind: 'method' };
      }

      // Function: function_declaration -> identifier
      if (type === 'function_declaration') {
        const nameNode = node.childForFieldName('name') || this.findChildByType(node, 'identifier');
        return { name: nameNode?.text, kind: 'function' };
      }

      // Variable/Field: public_field_definition, lexical_declaration -> property_identifier
      if (type === 'public_field_definition' || type === 'lexical_declaration') {
        const nameNode = this.findChildByType(node, 'property_identifier') || this.findChildByType(node, 'identifier');
        if (nameNode) return { name: nameNode.text, kind: 'variable' };
      }
    }

    // Python patterns
    if (lang === 'python') {
      // Function: function_definition
      if (type === 'function_definition') {
        const nameNode = node.childForFieldName('name') || this.findChildByType(node, 'identifier');
        return { name: nameNode?.text, kind: 'function' };
      }

      // Class: class_definition
      if (type === 'class_definition') {
        const nameNode = node.childForFieldName('name') || this.findChildByType(node, 'identifier');
        return { name: nameNode?.text, kind: 'class' };
      }

      // Method (inside class): function_definition inside class_body
      // Handled recursively through enclosing class

      // Variable assignment: assignment, assignment_statement
      if (type === 'assignment' || type === 'assignment_statement') {
        const left = node.childForFieldName('left') || node.child(0);
        if (left && left.type === 'identifier') {
          return { name: left.text, kind: 'variable' };
        }
      }
    }

    // Fallback: try to find an identifier or property_identifier
    const nameNode = this.findNameNode(node, lang);
    if (nameNode) {
      return { name: nameNode.text, kind: this.kindFromNodeType(type, lang) };
    }

    return { name: null, kind: 'unknown' };
  }

  findChildByType(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === type) {
        return child;
      }
    }
    return null;
  }

  findNameNode(node, lang) {
    // Look for identifier or property_identifier among children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier' || child.type === 'property_identifier') {
        return child;
      }
    }
    // Also check grandchildren for common patterns
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'class' || child.type === 'function' || child.type === 'arrow_function') {
        for (let j = 0; j < child.childCount; j++) {
          const nested = child.child(j);
          if (nested.type === 'identifier' || nested.type === 'property_identifier') {
            return nested;
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
    if (type.includes('variable') || type.includes('field') || type.includes('declaration')) return 'variable';
    if (type.includes('interface')) return 'interface';
    if (type.includes('type') || type.includes('enum')) return 'type';
    return 'unknown';
  }

  buildSignature(node, lang) {
    // Simplified signature capture
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
      context: null,
      evidence: 'identifier',
    };
  }

  /**
   * Extract import statement
   */
  extractImport(node, filePath, lang) {
    let importPath = null;
    let importKind = 'module';

    if (lang === 'python') {
      // For Python tree-sitter, import_from node type
      if (node.type === 'import_from') {
        const moduleNode = node.childForFieldName('module_name');
        if (moduleNode) {
          importPath = moduleNode.text;
        }
      } else if (node.type === 'import_statement') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          importPath = nameNode.text;
        }
      }
    } else if (lang === 'typescript' || lang === 'javascript') {
      // For JS/TS, import_statement or import_clause
      if (node.type === 'import_statement' || node.type === 'import_specifier') {
        const stringLit = node.childForFieldName('source') || node.descendantOfType('string');
        if (stringLit && stringLit.type === 'string') {
          importPath = stringLit.text.replace(/^['"]|['"]$/g, '');
        }
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
