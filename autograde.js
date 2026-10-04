const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

// 1. Setup config.env in the config folder
function setupConfig() {
  const src = path.join(__dirname, '__tests__', 'config.env');
  const destDir = path.join(__dirname, 'config');
  const dest = path.join(destDir, 'config.env');

  if (fs.existsSync(src)) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    console.log(
      'Successfully copied __tests__/config.env to config/config.env',
    );
  } else {
    console.warn('Warning: __tests__/config.env not found.');
  }
}

// 2. Read the server port from __tests__/config.env
function getPort() {
  const dest = path.join(__dirname, '__tests', 'config.env');
  if (fs.existsSync(dest)) {
    const content = fs.readFileSync(dest, 'utf8');
    const match = content.match(/^PORT\s*=\s*(\d+)/m);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return 5000; // default port
}

let serverLogs = [];

// 3. Start the Express server
function startServer() {
  console.log('Starting Express server...');
  serverLogs = [];
  const serverProcess = spawn('node', ['server.js'], {
    detached: false,
  });

  serverProcess.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);
    serverLogs.push(text);
    if (serverLogs.length > 200) serverLogs.shift();
  });

  serverProcess.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);
    serverLogs.push(text);
    if (serverLogs.length > 200) serverLogs.shift();
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    serverLogs.push(`Failed to start server: ${err.message}\n`);
  });

  return serverProcess;
}

// 4. Wait for the server to respond to HTTP requests
function waitServer(port, serverProcess, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const url = `http://localhost:${port}/api/v1/hospitals`;

    let serverExited = false;
    let exitCode = null;

    const onExit = (code) => {
      serverExited = true;
      exitCode = code;
    };

    serverProcess.on('exit', onExit);

    const interval = setInterval(() => {
      if (serverExited) {
        clearInterval(interval);
        serverProcess.off('exit', onExit);
        reject(new Error(`Server exited early with code ${exitCode}`));
        return;
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        serverProcess.off('exit', onExit);
        reject(new Error('Timeout waiting for server to start'));
        return;
      }

      http
        .get(url, (res) => {
          clearInterval(interval);
          serverProcess.off('exit', onExit);
          console.log(`Server responded with status ${res.statusCode}`);
          resolve();
        })
        .on('error', (err) => {
          // Keep polling
        });
    }, 500);
  });
}

// 5. Run Newman tests using PM.json
function runNewman() {
  return new Promise((resolve, reject) => {
    console.log('Running Newman tests on PM.json...');
    const reportPath = path.join(__dirname, 'newman-report.json');
    const PMcollectionPath = path.join(__dirname, '__tests__', 'PM.json');
    const cmd = `npx newman run ${PMcollectionPath} -r json --reporter-json-export "${reportPath}"`;

    exec(cmd, (error, stdout, stderr) => {
      // Newman exits with non-zero if tests fail, so we don't reject on error
      console.log(stdout);
      if (stderr) console.error(stderr);

      if (!fs.existsSync(reportPath)) {
        return reject(new Error('Newman failed to generate JSON report.'));
      }

      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const stats = report.run.stats;
        const assertions = stats.assertions;
        const total = assertions.total || 0;
        const failed = assertions.failed || 0;
        const passed = total - failed;

        // Extract error details for feedback
        const failures = (report.run.failures || []).map((f) => {
          return {
            name: f.parent?.name || 'Request',
            assertion: f.error?.test || 'Assertion failed',
            message: f.error?.message || 'Error occurred',
          };
        });

        resolve({ total, failed, passed, failures });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// 6. Commit and push the grades to the student's repository
function commitAndPush() {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    console.log('Not running in GitHub Actions. Skipping commit.');
    return;
  }

  try {
    const { execSync } = require('child_process');
    console.log('Switching to grades branch and committing...');

    // Configure git identity
    execSync(
      'git config --local user.email "github-actions[bot]@users.noreply.github.com"',
    );
    execSync('git config --local user.name "github-actions[bot]"');

    // Checkout/create a dedicated grades branch pointing to the current commit
    execSync('git checkout -B grades');

    // Force add files (in case they are gitignored)
    execSync('git add -f grade.json grade.md');

    // Commit changes if any
    try {
      execSync('git commit -m "chore: update autograding score [skip ci]"');
    } catch (e) {
      if (
        e.message.includes('nothing to commit') ||
        e.message.includes('no changes added to commit')
      ) {
        console.log('No changes to commit.');
      } else {
        throw e;
      }
    }

    // Force push to origin on the 'grades' branch
    execSync('git push origin grades --force');
    console.log(
      'Successfully committed and pushed grade files to grades branch!',
    );
  } catch (error) {
    console.error('Error committing/pushing grade files:', error.message);
  }
}

// Main execution function
async function main() {
  let serverProcess = null;
  const startTime = new Date();

  try {
    setupConfig();
    const port = getPort();
    serverProcess = startServer();

    await waitServer(port, serverProcess);
    console.log('Server is ready! Running tests...');

    const result = await runNewman();
    console.log('Tests completed successfully.');
    console.log(`Passed: ${result.passed}/${result.total}`);

    // Generate grade files
    const repo = process.env.GITHUB_REPOSITORY || 'local/repo';
    const percentage =
      result.total > 0
        ? ((result.passed / result.total) * 100).toFixed(2) + '%'
        : '0.00%';

    const gradeData = {
      repository: repo,
      score: result.passed,
      total: result.total,
      failed: result.failed,
      percentage: percentage,
      updatedAt: startTime.toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, 'grade.json'),
      JSON.stringify(gradeData, null, 2),
    );
    console.log('Generated grade.json');

    // Generate markdown report
    let markdown = `# Autograding Report\n\n`;
    markdown += `- **Repository:** \`${repo}\`\n`;
    markdown += `- **Score:** \`${result.passed} / ${result.total}\` (${percentage})\n`;
    markdown += `- **Last Updated:** \`${startTime.toLocaleString()}\`\n\n`;
    markdown += `## Summary\n`;
    markdown += `| Metric | Count |\n`;
    markdown += `| --- | --- |\n`;
    markdown += `| Passed Assertions | ${result.passed} |\n`;
    markdown += `| Failed Assertions | ${result.failed} |\n`;
    markdown += `| Total Assertions | ${result.total} |\n\n`;

    if (result.failures.length > 0) {
      markdown += `## Failed Assertions\n`;
      result.failures.forEach((f, idx) => {
        markdown += `### ${idx + 1}. Request: ${f.name}\n`;
        markdown += `- **Test:** \`${f.assertion}\`\n`;
        markdown += `- **Error:** \`${f.message}\`\n\n`;
      });
    } else {
      markdown += `## 🎉 All tests passed!\n`;
    }

    fs.writeFileSync(path.join(__dirname, 'grade.md'), markdown);
    console.log('Generated grade.md');

    // Push back to student repo
    commitAndPush();
  } catch (error) {
    console.error('Autograding failed:', error);

    // Create error grade files
    const repo = process.env.GITHUB_REPOSITORY || 'local/repo';
    const gradeData = {
      repository: repo,
      score: 0,
      total: 0,
      failed: 0,
      percentage: '0.00%',
      error: error.message,
      updatedAt: startTime.toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, 'grade.json'),
      JSON.stringify(gradeData, null, 2),
    );

    let markdown = `# Autograding Report (Failed)\n\n`;
    markdown += `An error occurred during autograding:\n\n`;
    markdown += `\`\`\`\n${error.message}\n\`\`\`\n\n`;

    if (serverLogs.length > 0) {
      markdown += `## Server Logs\n`;
      markdown += `Here is the last output from the server before failure:\n\n`;
      markdown += `\`\`\`\n${serverLogs.join('')}\n\`\`\`\n`;
    }

    fs.writeFileSync(path.join(__dirname, 'grade.md'), markdown);

    commitAndPush();
    process.exit(1);
  } finally {
    if (serverProcess) {
      console.log('Stopping server...');
      serverProcess.kill();
    }
    // Clean up temporary report
    const reportPath = path.join(__dirname, 'newman-report.json');
    if (fs.existsSync(reportPath)) {
      try {
        fs.unlinkSync(reportPath);
      } catch (err) {
        // ignore
      }
    }
  }
}

main();
