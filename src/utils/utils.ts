/*
 * Copyright 2026 Open Text.
 *
 * The only warranties for products and services of Open Text and
 * its affiliates and licensors (“Open Text”) are as may be set forth
 * in the express warranty statements accompanying such products and services.
 * Nothing herein should be construed as constituting an additional warranty.
 * Open Text shall not be liable for technical or editorial errors or
 * omissions contained herein. The information contained herein is subject
 * to change without notice.
 *
 * Except as specifically indicated otherwise, this document contains
 * confidential information and a valid license is required for possession,
 * use or copying. If this work is provided to the U.S. Government,
 * consistent with FAR 12.211 and 12.212, Commercial Computer Software,
 * Computer Software Documentation, and Technical Data for Commercial Items are
 * licensed to the U.S. Government under vendor's standard commercial license.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs/promises';
import { existsSync, lstatSync } from 'fs';
import * as path from 'path';
import { TestType } from '../dto/TestType.js';
import { Logger } from './logger.js';

const ACTIONS_XML = 'actions.xml';
const _TSP = '.tsp';
const _ST = '.st';
const logger: Logger = new Logger('utils');

function isTestMainFile(file: string): boolean {
  const f = file.toLowerCase();
  return f.endsWith(_TSP) || f.endsWith(_ST) || f === ACTIONS_XML;
}

function getParentFolderFullPath(fullFilePath: string): string {
  const resolvedPath = path.resolve(fullFilePath);
  return path.dirname(resolvedPath);
}

function getTestType(filePath: string): TestType {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === _ST || filePath == ACTIONS_XML) {
    return TestType.API;
  } else if (ext === _TSP) {
    return TestType.GUI;
  }

  return TestType.None;
}

/**
 * Checks if a string is blank, empty or contains only whitespace.
 * @param str The string to check.
 * @returns True if the string is null, undefined, empty, or contains only whitespace.
 */
function isBlank(str: string | null | undefined): boolean {
  return str === null || str === undefined || str.trim().length === 0;
}

const extractWorkflowFileName = (workflowPath: string): string => {
  return path.basename(workflowPath);
};

const sleep = async (milis: number): Promise<void> => {
  return new Promise<void>(resolve => {
    setTimeout(resolve, milis);
  });
};

const getFileIfExist = async (dirPath: string, fileName: string): Promise<string | null> => {
  const filePath = path.join(dirPath, fileName);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    logger.warn(`File ${filePath} does not exist`);
    return null;
  }
}

const getTimestamp = (): string => { // ddMMyyyyHHmmssSSS
  const now = new Date();
  const pad = (n: number, width = 2) => n.toString().padStart(width, '0');

  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1); // Months are 0-based
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const milliseconds = pad(now.getMilliseconds(), 3);

  return `${day}${month}${year}${hours}${minutes}${seconds}${milliseconds}`;
}

const escapePropVal = (val: string): string => {
  return val.replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/=/g, '\\=');
}

const checkReadWriteAccess = async (dirPath: string): Promise<void> => {
  if (!dirPath) {
    const err = `Missing environment variable RUNNER_WORKSPACE`;
    logger.error(`checkReadWriteAccess: ${err}`);
    throw new Error(err);
  }
  // Check read/write access to RUNNER_WORKSPACE
  logger.debug(`checkReadWriteAccess: [${dirPath}]`);
  try {
    await fs.access(dirPath, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error: any) {
    const err = `checkReadWriteAccess: [${dirPath}] => ${error.message}`;
    logger.error(err);
    throw new Error(err);
  }
}
const checkFileExists = async (fullPath: string): Promise <void> => {
  try {
    logger.debug(`ensureFileExists: [${fullPath}] ...`);
    await fs.access(fullPath, fs.constants.F_OK | fs.constants.R_OK);
    logger.debug(`Located [${fullPath}]`);
  } catch(error: any) {
    const err = `checkFileExists: Failed to locate [${fullPath}]: ${error.message}`;
    logger.error(err);
    throw new Error(err);
  }
}

const escapeXML = (str: string | null | undefined): string => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const parseTimeToFloat = (time: string): number => {
  if (time) {
    try {
      return parseFloat(time.replace(",", ""));
    } catch (e) {
      // hmm, don't know what this format is.
    }
  }
  return NaN;
}

const getLastFolderFromPath = (dirPath: string): string => {
  if (!dirPath) return "";
  // Remove trailing slashes and normalize path
  const cleanPath = path.normalize(dirPath.replace(/[\\/]+$/, ''));
  if (existsSync(cleanPath) && lstatSync(cleanPath).isDirectory()) {
    return path.basename(cleanPath);
  } else {
    return cleanPath;
  }
}

export { isBlank, isTestMainFile, getTestType, getParentFolderFullPath, extractWorkflowFileName, sleep, getFileIfExist, getTimestamp, escapePropVal, checkReadWriteAccess, checkFileExists, escapeXML, parseTimeToFloat, getLastFolderFromPath };
