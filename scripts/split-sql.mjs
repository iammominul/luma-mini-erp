/**
 * Split a .sql file into statements.
 *
 * A plain split on ";" is wrong: a semicolon inside a comment or a string
 * literal is not a statement boundary, and a chunk that turns out to be only
 * comments is not a statement at all. Both cases exist in real schema files, so
 * this walks the text instead. Dollar quoting is not handled, because the
 * schema has no function bodies; add it here if that ever changes.
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (inString) {
      current += char;
      // '' inside a string is an escaped quote, not the end of it.
      if (char === "'" && next === "'") {
        current += next;
        i++;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      inLineComment = true;
      current += char;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      current += char;
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === ';') {
      statements.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  statements.push(current);

  return statements
    .map((statement) => statement.trim())
    .filter((statement) => hasCode(statement));
}

/** Is there anything here besides comments and whitespace? */
function hasCode(statement) {
  const withoutComments = statement
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim();
  return withoutComments.length > 0;
}
