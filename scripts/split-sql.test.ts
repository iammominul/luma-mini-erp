import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from './split-sql.mjs';

/**
 * The splitter decides what gets sent to Postgres, so a bug here can apply half
 * a migration. The dollar-quoting cases are the ones the schema depends on.
 */
describe('splitSqlStatements', () => {
  it('splits on statement boundaries', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual([
      'SELECT 1',
      'SELECT 2',
    ]);
  });

  it('ignores a semicolon inside a line comment', () => {
    const sql = `-- a note; with a semicolon\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toHaveLength(1);
  });

  it('ignores a semicolon inside a string literal', () => {
    const statements = splitSqlStatements(`INSERT INTO t VALUES ('a;b');`);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("'a;b'");
  });

  it('drops a chunk that is only comments', () => {
    expect(splitSqlStatements('-- just a heading\n')).toEqual([]);
  });

  it('keeps a dollar-quoted block whole', () => {
    const sql = `DO $$ BEGIN
      IF true THEN
        ALTER TABLE bill_line RENAME COLUMN qty_kg TO grey_kg;
      END IF;
    END $$;
    SELECT 1;`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('RENAME COLUMN qty_kg TO grey_kg;');
    expect(statements[0]).toContain('END IF;');
    expect(statements[1]).toBe('SELECT 1');
  });

  it('keeps a tagged dollar-quoted block whole', () => {
    const sql = `DO $mig$ BEGIN PERFORM 1; END $mig$;\nSELECT 2;`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('PERFORM 1;');
  });

  it('does not treat a lone dollar sign as a quote', () => {
    expect(splitSqlStatements('SELECT 1 AS "a$b"; SELECT 2;')).toHaveLength(2);
  });
});
