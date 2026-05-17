import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const factoryDir = path.dirname(scriptDir);
const rootDir = path.dirname(path.dirname(factoryDir));
const ruleTargets = [
  { sourceContext: 'frontend', targetPath: 'apps/web' },
];
const skillTargets = [
  { sourcePath: '.' },
  { sourcePath: 'supabase' },
  { sourcePath: 'expo' },
];

console.log(`Syncing context-factory from: ${factoryDir}`);
console.log(`To monorepo root: ${rootDir}`);
console.log('');

function copyFile(sourcePath, targetPath) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
}

function copyDirectoryContents(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir)) {
    cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), {
      recursive: true,
    });
  }
}

function syncRootDocs() {
  console.log('-> Syncing root docs (AGENTS.md, CLAUDE.md only)...');
  copyFile(path.join(factoryDir, 'root', 'AGENTS.md'), path.join(rootDir, 'AGENTS.md'));
  copyFile(path.join(factoryDir, 'root', 'CLAUDE.md'), path.join(rootDir, 'CLAUDE.md'));
  console.log('  ok Synced root AGENTS.md and CLAUDE.md');
}

function syncRulesDir(sourceContext, targetAppPath) {
  const sourceRules = path.join(factoryDir, sourceContext, 'rules');
  const targetDir = path.join(rootDir, targetAppPath);
  const targetRules = path.join(targetDir, 'rules');

  if (!existsSync(targetDir)) {
    console.log(`! ${targetAppPath} not found, skipping...`);
    return;
  }

  if (!existsSync(sourceRules)) {
    console.log(`! ${sourceContext} rules directory not found, skipping ${targetAppPath}...`);
    return;
  }

  rmSync(targetRules, { recursive: true, force: true });
  mkdirSync(targetRules, { recursive: true });
  copyDirectoryContents(sourceRules, targetRules);
  console.log(`  ok Synced ${sourceContext}/rules -> ${targetAppPath}/rules`);
}

function getSkillSourceDirs(sourcePath = '.') {
  const skillsBaseDir = path.join(factoryDir, sourcePath);

  if (!existsSync(skillsBaseDir)) {
    return [];
  }

  return readdirSync(skillsBaseDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(directoryName => existsSync(path.join(skillsBaseDir, directoryName, 'SKILL.md')))
    .map(directoryName => ({
      skillName: directoryName,
      sourceSkillDir: path.join(skillsBaseDir, directoryName),
      relativeSourcePath:
        sourcePath === '.' ? directoryName : path.join(sourcePath, directoryName),
    }));
}

function syncSkillsForAssistant(assistantSkillsDir) {
  const absoluteAssistantSkillsDir = path.join(rootDir, assistantSkillsDir);
  const skillSourceDirs = skillTargets.flatMap(({ sourcePath }) => getSkillSourceDirs(sourcePath));

  console.log(`-> Syncing skills into ${assistantSkillsDir}...`);
  mkdirSync(absoluteAssistantSkillsDir, { recursive: true });

  if (skillSourceDirs.length === 0) {
    console.log('! No skill directories found, skipping...');
    return;
  }

  for (const { skillName, sourceSkillDir, relativeSourcePath } of skillSourceDirs) {
    const targetSkillDir = path.join(absoluteAssistantSkillsDir, skillName);

    rmSync(targetSkillDir, { recursive: true, force: true });
    cpSync(sourceSkillDir, targetSkillDir, { recursive: true });
    console.log(
      `  ok Synced tools/context-factory/${relativeSourcePath} -> ${assistantSkillsDir}/${skillName}`
    );
  }
}

syncRootDocs();

console.log('-> Syncing rules directories...');
for (const { sourceContext, targetPath } of ruleTargets) {
  syncRulesDir(sourceContext, targetPath);
}

syncSkillsForAssistant('.agent/skills');
syncSkillsForAssistant('.agents/skills');
syncSkillsForAssistant('.claude/skills');
syncSkillsForAssistant('.cursor/skills');

console.log('');
console.log('Sync complete!');
