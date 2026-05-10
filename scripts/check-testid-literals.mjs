#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "apps", "web", "src");
const skippedDirs = new Set(["__tests__", "node_modules", "dist"]);
const checkedExtensions = new Set([".ts", ".tsx"]);
const allowMarker = "allow-testid-literal";

const violations = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) {
        await walk(path.join(dir, entry.name));
      }
      continue;
    }

    if (!entry.isFile() || !checkedExtensions.has(path.extname(entry.name))) {
      continue;
    }

    await checkFile(path.join(dir, entry.name));
  }
}

async function checkFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const lineStarts = getLineStarts(source);
  let index = 0;

  while (index < source.length) {
    const testIdIndex = source.indexOf("data-testid", index);

    if (testIdIndex === -1) {
      break;
    }

    index = testIdIndex;
    const equalsIndex = skipWhitespace(source, index + "data-testid".length);

    if (source[equalsIndex] !== "=") {
      index += "data-testid".length;
      continue;
    }

    const valueIndex = skipWhitespace(source, equalsIndex + 1);
    const quote = source[valueIndex];

    if ((quote === `"` || quote === "'") && !isAllowedLine(source, lineStarts, index)) {
      const lineNumber = findLineNumber(lineStarts, index);
      const lineText = getLine(source, lineStarts, lineNumber).trim();
      violations.push({
        filePath,
        lineNumber,
        lineText,
      });
    }

    index = valueIndex + 1;
  }
}

function skipWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function getLineStarts(source) {
  const starts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      starts.push(index + 1);
    }
  }

  return starts;
}

function findLineNumber(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid];
    const nextStart = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

    if (index < start) {
      high = mid - 1;
    } else if (index >= nextStart) {
      low = mid + 1;
    } else {
      return mid + 1;
    }
  }

  return lineStarts.length;
}

function getLine(source, lineStarts, lineNumber) {
  const start = lineStarts[lineNumber - 1];
  const end = lineStarts[lineNumber] === undefined ? source.length : lineStarts[lineNumber] - 1;

  return source.slice(start, end);
}

function isAllowedLine(source, lineStarts, index) {
  const lineNumber = findLineNumber(lineStarts, index);
  const line = getLine(source, lineStarts, lineNumber);

  return line.includes(`// ${allowMarker}`) || line.includes(`//${allowMarker}`);
}

try {
  await walk(srcRoot);
} catch (error) {
  console.error(`Unable to check test IDs: ${error.message}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error("Literal data-testid strings are not allowed in apps/web/src production code.");
  console.error("Use data-testid={...} or add // allow-testid-literal for an explicit exception.");
  console.error("");

  for (const violation of violations) {
    const relativePath = path.relative(repoRoot, violation.filePath);
    console.error(`${relativePath}:${violation.lineNumber}: ${violation.lineText}`);
  }

  process.exit(1);
}

console.log("No literal data-testid strings found in apps/web/src production code.");
