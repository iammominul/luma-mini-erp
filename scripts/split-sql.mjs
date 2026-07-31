/**
 * Split a .sql file into statements.
 *
 * A plain split on ";" is wrong: a semicolon inside a comment, a string
 * literal, or a dollar-quoted block is not a statement boundary, and a chunk
 * that turns out to be only comments is not a statement at all. All three cases
 * exist in real schema files, so this walks the text instead.
 *
 * Dollar quoting matters because the schema guards a column rename in a DO
 * block, and the body of one is full of semicolons.
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
    if (char === '$') {
      // $$ or $tag$ opens a dollar-quoted block that runs to the matching tag.
      const tag = dollarTagAt(sql, i);
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        // An unterminated block is a malformed file; keep the rest verbatim so
        // Postgres reports it rather than this splitter mangling it silently.
        const end = close === -1 ? sql.length : close + tag.length;
        current += sql.slice(i, end);
        i = end - 1;
        continue;
      }
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

/**
 * The dollar-quote tag opening at this position ('$$' or '$name$'), or null if
 * the dollar sign is something else, such as a positional parameter.
 */
function dollarTagAt(sql, index) {
  const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
  return match ? match[0] : null;
}

/** Is there anything here besides comments and whitespace? */
function hasCode(statement) {
  const withoutComments = statement
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim();
  return withoutComments.length > 0;
}
