const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const defaultDatabasePath = path.join(process.cwd(), "data", "product-passports.sqlite");
const migrationsDir = path.join(process.cwd(), "db", "migrations");

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function rowToPassport(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicId: row.public_id,
    status: row.status,
    productUrl: row.product_url,
    retailer: row.retailer,
    productName: row.product_name,
    brand: row.brand,
    extractionStatus: row.extraction_status,
    report: parseJson(row.report_json, {}),
    snapshot: parseJson(row.snapshot_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

class SqlitePassportStore {
  constructor(options = {}) {
    this.databasePath = options.databasePath || process.env.PRODUCT_PASSPORT_DB || defaultDatabasePath;
    this.migrationsPath = options.migrationsPath || migrationsDir;
    this.database = null;
  }

  open() {
    if (this.database) {
      return this.database;
    }

    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.database = new DatabaseSync(this.databasePath);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.applyMigrations();
    return this.database;
  }

  close() {
    if (this.database) {
      this.database.close();
      this.database = null;
    }
  }

  applyMigrations() {
    const database = this.database;
    const migrationFiles = fs
      .readdirSync(this.migrationsPath)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(this.migrationsPath, file), "utf8");
      database.exec(sql);
    }
  }

  createPassport(passport) {
    const database = this.open();

    database.prepare(`
      INSERT INTO product_passports (
        id,
        public_id,
        status,
        product_url,
        retailer,
        product_name,
        brand,
        extraction_status,
        report_json,
        snapshot_json,
        created_at,
        updated_at,
        published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      passport.id,
      passport.publicId || null,
      passport.status,
      passport.productUrl,
      passport.retailer,
      passport.productName,
      passport.brand,
      passport.extractionStatus,
      JSON.stringify(passport.report || {}),
      JSON.stringify(passport.snapshot || null),
      passport.createdAt,
      passport.updatedAt,
      passport.publishedAt || null
    );

    return this.getPassport(passport.id);
  }

  getPassport(id) {
    const row = this.open()
      .prepare("SELECT * FROM product_passports WHERE id = ?")
      .get(id);

    return rowToPassport(row);
  }

  getPassportByPublicId(publicId) {
    const row = this.open()
      .prepare("SELECT * FROM product_passports WHERE public_id = ? AND status = 'published'")
      .get(publicId);

    return rowToPassport(row);
  }

  listPassports(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);

    if (options.status) {
      return this.open()
        .prepare(`
          SELECT * FROM product_passports
          WHERE status = ?
          ORDER BY updated_at DESC
          LIMIT ?
        `)
        .all(options.status, limit)
        .map(rowToPassport);
    }

    return this.open()
      .prepare(`
        SELECT * FROM product_passports
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(limit)
      .map(rowToPassport);
  }

  updatePassport(id, changes) {
    const allowedColumns = {
      publicId: "public_id",
      status: "status",
      productUrl: "product_url",
      retailer: "retailer",
      productName: "product_name",
      brand: "brand",
      extractionStatus: "extraction_status",
      report: "report_json",
      snapshot: "snapshot_json",
      updatedAt: "updated_at",
      publishedAt: "published_at",
    };

    const entries = Object.entries(changes)
      .filter(([key]) => allowedColumns[key])
      .map(([key, value]) => {
        if (key === "report" || key === "snapshot") {
          return [allowedColumns[key], JSON.stringify(value || null)];
        }

        return [allowedColumns[key], value || null];
      });

    if (entries.length === 0) {
      return this.getPassport(id);
    }

    const assignments = entries.map(([column]) => `${column} = ?`).join(", ");
    const values = entries.map(([, value]) => value);

    this.open()
      .prepare(`UPDATE product_passports SET ${assignments} WHERE id = ?`)
      .run(...values, id);

    return this.getPassport(id);
  }

  recordEvent(event) {
    this.open()
      .prepare(`
        INSERT INTO passport_events (
          id,
          passport_id,
          event_type,
          payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        event.id,
        event.passportId,
        event.eventType,
        JSON.stringify(event.payload || {}),
        event.createdAt
      );
  }

  listEvents(passportId) {
    return this.open()
      .prepare(`
        SELECT * FROM passport_events
        WHERE passport_id = ?
        ORDER BY created_at ASC
      `)
      .all(passportId)
      .map((row) => ({
        id: row.id,
        passportId: row.passport_id,
        eventType: row.event_type,
        payload: parseJson(row.payload_json, {}),
        createdAt: row.created_at,
      }));
  }
}

module.exports = {
  SqlitePassportStore,
  rowToPassport,
};
