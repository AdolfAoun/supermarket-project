// mysql2 does not interpret the mysql/phpMyAdmin DELIMITER client directive.
// Execute this repository's line-delimited SQL scripts without splitting routines.
export async function executeSqlScript(query: (sql: string) => Promise<unknown>, script: string) {
  let delimiter = ';', pending = '';
  for (const line of script.split(/\r?\n/)) {
    const directive = /^DELIMITER (\S+)\s*$/i.exec(line);
    if (directive) { delimiter = directive[1]; continue; }
    pending += line + '\n';
    if (line.trimEnd().endsWith(delimiter) && !line.trimStart().startsWith('--')) {
      await query(pending.trimEnd().slice(0, -delimiter.length)); pending = '';
    }
  }
  if (pending.replace(/--[^\n]*/g, '').trim()) throw new Error('Unterminated SQL script');
}
