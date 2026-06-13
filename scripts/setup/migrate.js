#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

async function run() {
  console.log(`[delego] db:migrate — connecting to database: ${databaseUrl}`);
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    
    // Read 001_initial.sql
    const sqlPath = path.join(__dirname, "../../database/schema/001_initial.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    console.log("[delego] db:migrate — running initial schema migration...");
    await client.query(sql);
    console.log("[delego] db:migrate — schema migrated successfully.");
  } catch (err) {
    console.error("[delego] db:migrate — migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
