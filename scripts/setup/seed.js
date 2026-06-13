#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

async function run() {
  console.log(`[delego] db:seed — connecting to database: ${databaseUrl}`);
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    
    // Read dev.sql
    const sqlPath = path.join(__dirname, "../../database/seed/dev.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    console.log("[delego] db:seed — seeding development data...");
    await client.query(sql);
    console.log("[delego] db:seed — seeding completed successfully.");
  } catch (err) {
    console.error("[delego] db:seed — seeding failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
