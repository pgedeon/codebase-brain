import('web-tree-sitter').then(module => {
  const Parser = module.default || module;
  console.log('Imported:', typeof Parser);
  console.log('Keys:', Object.getOwnPropertyNames(Parser));
  console.log('Has Language?', 'Language' in Parser);
  console.log('Has init?', 'init' in Parser);
  // Try calling init if exists
  if (Parser.init) {
    Parser.init().then(() => {
      console.log('After init, Parser.Language?', 'Language' in Parser);
      console.log('Parser.Language value:', Parser.Language);
    }).catch(err => console.error('Init error:', err));
  }
});
