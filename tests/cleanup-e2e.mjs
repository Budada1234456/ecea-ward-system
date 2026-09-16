import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const testUserPattern = "formtest%";

export default function cleanupE2e() {
  const db = new DatabaseSync("data/award-system.db");
  db.exec("PRAGMA foreign_keys = ON");

  try {
    const users = db
      .prepare("SELECT id, username FROM users WHERE username LIKE ?")
      .all(testUserPattern);
    const applications = db
      .prepare(
        `SELECT id, title
         FROM applications
         WHERE title LIKE ?
            OR title LIKE ?
            OR owner_id IN (SELECT id FROM users WHERE username LIKE ?)`,
      )
      .all("浏览器验收项目-%", "表单组件验收项目-%", testUserPattern);
    const applicationFiles = applications.flatMap((application) =>
      db
        .prepare(
          "SELECT stored_path FROM application_files WHERE application_id = ? AND stored_path IS NOT NULL",
        )
        .all(application.id),
    );

    const removeAuditLogs = db.prepare(
      "DELETE FROM audit_logs WHERE application_id = ?",
    );
    const removeFiles = db.prepare(
      "DELETE FROM application_files WHERE application_id = ?",
    );
    const removeApplication = db.prepare(
      "DELETE FROM applications WHERE id = ?",
    );
    const removeSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?");
    const removeResetTokens = db.prepare(
      "DELETE FROM password_reset_tokens WHERE user_id = ?",
    );
    const removeUser = db.prepare("DELETE FROM users WHERE id = ?");

    let removedAuditLogs = 0;
    let removedFiles = 0;
    let removedSessions = 0;
    let removedResetTokens = 0;

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const application of applications) {
        removedAuditLogs += removeAuditLogs.run(application.id).changes;
        removedFiles += removeFiles.run(application.id).changes;
        removeApplication.run(application.id);
      }
      for (const user of users) {
        removedSessions += removeSessions.run(user.id).changes;
        removedResetTokens += removeResetTokens.run(user.id).changes;
        removeUser.run(user.id);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    for (const directory of new Set(
      applicationFiles.map((file) => dirname(file.stored_path)),
    )) {
      rmSync(directory, { recursive: true, force: true });
    }

    const result = {
      removedApplications: applications.length,
      removedAuditLogs,
      removedFiles,
      removedUsers: users.length,
      removedSessions,
      removedResetTokens,
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    db.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  cleanupE2e();
}
