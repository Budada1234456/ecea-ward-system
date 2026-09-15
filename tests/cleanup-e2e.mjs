import { DatabaseSync } from "node:sqlite";

export default function cleanupE2e() {
  const db = new DatabaseSync("data/award-system.db");
  const rows = db
    .prepare("SELECT id, title FROM applications WHERE title LIKE ?")
    .all("浏览器验收项目-%");

  for (const row of rows) {
    db.prepare("DELETE FROM audit_logs WHERE application_id = ?").run(row.id);
    db.prepare("DELETE FROM application_files WHERE application_id = ?").run(
      row.id,
    );
    db.prepare("DELETE FROM applications WHERE id = ?").run(row.id);
  }

  console.log(JSON.stringify({ removed: rows.length }));
  db.close();
}
