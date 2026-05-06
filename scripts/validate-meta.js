#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = {
  id: 'string',
  title: 'string',
  distro: 'string',
  difficulty: 'string',
  duration_minutes: 'number',
  objectives: 'array',
  description: 'string',
};

const DISTRO_VALUES = ['ubuntu-22.04', 'rocky-9'];
const DIFFICULTY_VALUES = ['beginner', 'intermediate', 'advanced'];
const TYPE_VALUES = ['scenario', 'sandbox'];

function isSandbox(data) {
  return data.type === 'sandbox';
}

function validate(filePath) {
  const errors = [];

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return [`cannot read file: ${e.message}`];
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return [`invalid JSON: ${e.message}`];
  }

  for (const [field, type] of Object.entries(REQUIRED_FIELDS)) {
    if (!(field in data)) {
      errors.push(`missing required field: ${field}`);
      continue;
    }
    const val = data[field];
    if (type === 'array') {
      if (!Array.isArray(val)) errors.push(`${field} must be an array`);
      else if (val.length === 0 && !isSandbox(data)) errors.push(`${field} must be non-empty`);
    } else if (type === 'string') {
      if (typeof val !== 'string') errors.push(`${field} must be a string`);
      else if (val.trim() === '') errors.push(`${field} must be non-empty`);
    } else if (type === 'number') {
      if (isSandbox(data) && field === 'duration_minutes' && val === null) {
        continue;
      }
      if (!Number.isInteger(val)) errors.push(`${field} must be an integer`);
      else if (val < 1 || val > 120) errors.push(`${field} must be between 1 and 120`);
    }
  }

  if (data.distro && !DISTRO_VALUES.includes(data.distro)) {
    errors.push(`distro must be one of: ${DISTRO_VALUES.join(', ')}`);
  }

  const difficultyValues = isSandbox(data) ? ['open'] : DIFFICULTY_VALUES;
  if (data.difficulty && !difficultyValues.includes(data.difficulty)) {
    errors.push(`difficulty must be one of: ${difficultyValues.join(', ')}`);
  }

  if (data.type && !TYPE_VALUES.includes(data.type)) {
    errors.push(`type must be one of: ${TYPE_VALUES.join(', ')}`);
  }

  if (data.objectives && Array.isArray(data.objectives)) {
    for (const obj of data.objectives) {
      if (typeof obj !== 'string') errors.push('each objective must be a string');
    }
  }

  // id must match parent directory name
  if (data.id) {
    const parentDir = path.basename(path.dirname(filePath));
    if (data.id !== parentDir) {
      errors.push(`id "${data.id}" must match parent directory name "${parentDir}"`);
    }
  }

  // Optional boolean fields
  for (const field of ['timed', 'dynamic', 'requires_cap_sys_admin']) {
    if (field in data && typeof data[field] !== 'boolean') {
      errors.push(`${field} must be a boolean`);
    }
  }

  // Optional string fields
  for (const field of ['distro_pair']) {
    if (field in data && typeof data[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  }

  // Optional array of strings
  if ('plugins' in data) {
    if (!Array.isArray(data.plugins)) {
      errors.push('plugins must be an array');
    } else {
      for (const p of data.plugins) {
        if (typeof p !== 'string') errors.push('each plugin must be a string');
      }
    }
  }

  return errors;
}

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Usage: validate-meta.js <meta.json> [meta.json ...]');
  process.exit(1);
}

let anyFailed = false;

for (const filePath of files) {
  const errors = validate(filePath);
  if (errors.length > 0) {
    anyFailed = true;
    for (const err of errors) {
      console.error(`${filePath}: ${err}`);
    }
  } else {
    console.log(`${filePath}: OK`);
  }
}

process.exit(anyFailed ? 1 : 0);
