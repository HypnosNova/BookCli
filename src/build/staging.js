const fs = require('fs');
const path = require('path');

function createStagingDirectory(distDir) {
  fs.mkdirSync(distDir, { recursive: true });
  return fs.mkdtempSync(path.join(distDir, '.bookcli-staging-'));
}

function publishStagedArtifacts(stagingDir, distDir, artifactNames) {
  const backupDir = fs.mkdtempSync(path.join(distDir, '.bookcli-backup-'));
  const states = [];

  try {
    for (const artifactName of artifactNames) {
      const sourcePath = path.join(stagingDir, artifactName);
      const targetPath = path.join(distDir, artifactName);
      const backupPath = path.join(backupDir, artifactName);
      const state = {
        sourcePath,
        targetPath,
        backupPath,
        hadTarget: fs.existsSync(targetPath),
        published: false,
      };
      states.push(state);

      if (state.hadTarget) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.renameSync(targetPath, backupPath);
      }
      if (fs.existsSync(sourcePath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.renameSync(sourcePath, targetPath);
        state.published = true;
      }
    }
  } catch (err) {
    rollbackPublishedArtifacts(states);
    throw err;
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

function rollbackPublishedArtifacts(states) {
  for (const state of [...states].reverse()) {
    if (state.published) fs.rmSync(state.targetPath, { recursive: true, force: true });
    if (state.hadTarget && fs.existsSync(state.backupPath)) {
      fs.mkdirSync(path.dirname(state.targetPath), { recursive: true });
      fs.renameSync(state.backupPath, state.targetPath);
    }
  }
}

function removeStagingDirectory(stagingDir) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

module.exports = { createStagingDirectory, publishStagedArtifacts, removeStagingDirectory };
