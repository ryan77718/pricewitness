import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";

export function localDatabase(path) {
  const connection = new DatabaseSync(path);
  const initialized = connection.prepare("SELECT 1 FROM sqlite_master WHERE name = 'threads'").get();
  if (!initialized) connection.exec(readFileSync(new URL("../drizzle/0000_community.sql", import.meta.url), "utf8"));

  class Statement {
    constructor(sql, params = []) {
      this.sql = sql;
      this.params = params;
    }
    bind(...params) {
      return new Statement(this.sql, params);
    }
    first() {
      return connection.prepare(this.sql).get(...this.params);
    }
    run() {
      return {results: connection.prepare(this.sql).all(...this.params)};
    }
  }

  return {
    prepare: sql => new Statement(sql),
    batch(queries) {
      connection.exec("BEGIN");
      try {
        const results = queries.map(query => query.run());
        connection.exec("COMMIT");
        return results;
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => connection.close()
  };
}
