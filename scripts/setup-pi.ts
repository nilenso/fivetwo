#!/usr/bin/env bun
/**
 * Sets up fivetwo pi-agent integration by symlinking:
 * - Commands to ~/.pi/agent/commands/
 * - Skills to ~/.pi/agent/skills/
 */

import { mkdir, symlink, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const REPO_ROOT = dirname(dirname(import.meta.path));
const PI_COMMANDS_DIR = join(REPO_ROOT, ".pi", "commands");
const PI_SKILLS_DIR = join(REPO_ROOT, ".pi", "skills");

const GLOBAL_COMMANDS_DIR = join(homedir(), ".pi", "agent", "commands");
const GLOBAL_SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function linkFile(source: string, target: string): Promise<void> {
  try {
    const existing = await Bun.file(target).exists();
    if (existing) {
      // Check if it's already linked to the same source
      const realPath = await Bun.$`readlink -f ${target}`.text();
      const sourceRealPath = await Bun.$`readlink -f ${source}`.text();
      if (realPath.trim() === sourceRealPath.trim()) {
        console.log(`  ✓ ${target} (already linked)`);
        return;
      }
      console.log(`  ⚠ ${target} exists, skipping`);
      return;
    }
    await symlink(source, target);
    console.log(`  ✓ ${target}`);
  } catch (err) {
    console.error(`  ✗ Failed to link ${target}: ${err}`);
  }
}

async function linkCommands(): Promise<void> {
  console.log("\nLinking commands to", GLOBAL_COMMANDS_DIR);
  await ensureDir(GLOBAL_COMMANDS_DIR);

  const files = await readdir(PI_COMMANDS_DIR);
  for (const file of files) {
    if (file.endsWith(".md")) {
      const source = join(PI_COMMANDS_DIR, file);
      const target = join(GLOBAL_COMMANDS_DIR, file);
      await linkFile(source, target);
    }
  }
}

async function findSkills(dir: string): Promise<string[]> {
  const skills: string[] = [];
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name === "SKILL.md") {
        // Return the directory containing SKILL.md
        skills.push(currentDir);
      }
    }
  }
  
  await walk(dir);
  return skills;
}

async function linkSkills(): Promise<void> {
  console.log("\nLinking skills to", GLOBAL_SKILLS_DIR);
  await ensureDir(GLOBAL_SKILLS_DIR);

  const skillDirs = await findSkills(PI_SKILLS_DIR);
  for (const skillDir of skillDirs) {
    // Use the skill directory name as the link name
    const skillName = skillDir.split("/").pop()!;
    const target = join(GLOBAL_SKILLS_DIR, skillName);
    await linkFile(skillDir, target);
  }
}

async function main(): Promise<void> {
  console.log("Setting up fivetwo pi-agent integration...");
  console.log("Repository root:", REPO_ROOT);

  await linkCommands();
  await linkSkills();

  console.log("\n✓ Setup complete!");
  console.log("\nTo use fivetwo with pi-agent:");
  console.log("  1. Set FIVETWO_URL (default: http://localhost:3000)");
  console.log("  2. Set FIVETWO_TOKEN (generate with: bun run auth <username>)");
  console.log("  3. Use the /52 command to start working on cards");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
