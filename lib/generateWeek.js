const { spawn } = require('child_process');
const path = require('path');

const PYTHON_DIR = path.join(__dirname, '..', 'python');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

class MenuParseError extends Error {}

// Runs python/run_batch.py, which parses the uploaded xlsx and renders the 7
// daily PDFs into outDir. Resolves with the JSON manifest it prints on success;
// rejects with a MenuParseError (clean message, safe to show the uploader) if
// the xlsx layout didn't match, or a generic Error for anything else.
function generateWeek(xlsxPath, outDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, ['run_batch.py', xlsxPath, outDir], { cwd: PYTHON_DIR });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) return reject(new MenuParseError(parsed.error));
        } catch (_) {
          // stdout wasn't JSON — fall through to the generic error below
        }
        return reject(new Error(stderr.trim() || `run_batch.py exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error(`Could not parse run_batch.py output: ${stdout}`));
      }
    });
  });
}

module.exports = { generateWeek, MenuParseError };
