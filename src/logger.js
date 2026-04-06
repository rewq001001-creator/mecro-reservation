import fs from "node:fs";
import path from "node:path";

function formatLine(level, message, extra = {}) {
  const timestamp = new Date().toISOString();
  const payload = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  return `[${timestamp}] [${level}] ${message}${payload}`;
}

export function createLogger() {
  const logDir = path.resolve(process.cwd(), "logs");
  fs.mkdirSync(logDir, { recursive: true });

  const now = new Date();
  const fileName = `reservation-${now.toISOString().replace(/[:.]/g, "-")}.log`;
  const logPath = path.join(logDir, fileName);
  const latestPath = path.join(logDir, "latest.log");

  function write(level, message, extra = {}) {
    const line = formatLine(level, message, extra);
    console.log(line);
    fs.appendFileSync(logPath, `${line}\n`);
    fs.writeFileSync(latestPath, `${line}\n`, { flag: "a" });
  }

  return {
    logPath,
    logDir,
    createArtifactPath(...segments) {
      const artifactPath = path.join(logDir, ...segments);
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      return artifactPath;
    },
    info(message, extra) {
      write("INFO", message, extra);
    },
    warn(message, extra) {
      write("WARN", message, extra);
    },
    error(message, extra) {
      write("ERROR", message, extra);
    }
  };
}
