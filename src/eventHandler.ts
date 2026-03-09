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

import { notice } from '@actions/core';
import { context } from '@actions/github';
import { config } from './config/config.js';
import { Logger } from './utils/logger.js';
import * as path from 'path';
import GitHubClient from './client/githubClient.js';
import { ExitCode } from './ft/ExitCode.js';
import FtTestExecuter from './ft/FtTestExecuter.js';
import * as fs from 'fs';
import FTL from './ft/FTL.js';
import { RunType } from './dto/RunType.js';
import { checkoutRepo } from './utils/utils.js';

const logger: Logger = new Logger('eventHandler');

export const handleCurrentEvent = async (): Promise<void> => {
  logger.info('BEGIN handleEvent ...');
  const startTime = new Date().getTime();

  if (config.logLevel === 2) {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GITHUB_') || key.startsWith('RUNNER_')) {
        logger.debug(`${key}=${value}`);
      }
    }
  }

  const event = context.payload;
  const eventName = context.eventName ?? event.name;

  logger.debug("context:", context);
  logger.info(`eventType = ${eventName}`);

  const ref: string | undefined = event.ref;
  let branch: string | undefined;
  if (ref && ref.startsWith('refs/heads/')) {
    branch = ref.slice(11);  // 'refs/heads/' has 11 characters
  } else {
    branch = event.repository?.default_branch ?? event.repository?.master_branch;
  }
  if (!branch) {
    throw new Error('Could not determine branch name!');
  }

  logger.info(`Current repository URL: ${config.repoUrl}`);

  const workDir = process.cwd(); //.env.GITHUB_WORKSPACE || '.';
  logger.info(`Working directory: ${workDir}`);
  await cleanupWSFolder();

  //await checkoutRepoAndCreateSymLink(workDir, branch);
  await checkoutRepo(workDir);

  const runType = validateAndGetRunType();
  const testPaths = await validateAndGetTestPaths();
  const exitCode = await run();
  //TODO use exitCode ?

  logger.info(`END handleEvent. ExitCode=${exitCode}`);
  // END of handleCurrentEvent function

  async function run(): Promise<ExitCode> {
    logger.debug(`BEGIN run: ...`);
    try {
      const repoFolderPath = workDir;

      const { propsFullPath, resFullPath } = await FtTestExecuter.preProcess(runType, testPaths);
      const exitCode = await FtTestExecuter.process(propsFullPath);
      await GitHubClient.uploadArtifact(config.runnerWorkspacePath, [propsFullPath, resFullPath], `temp_files`);
      logger.info(`END run: ExitCode=${exitCode}.`);
      return exitCode;
    } catch (error) {
      logger.error(`run: ${error}`);
      return ExitCode.Aborted;
    } finally {
      logger.error(`END run.`);
    }
  }
};

const cleanupWSFolder = async () => {
  logger.debug(`cleanupWSFolder: ${config.runnerWorkspacePath}`);

  try {
    // Check if the path exists and is a directory
    const stats = await fs.promises.stat(config.runnerWorkspacePath);
    if (!stats.isDirectory()) {
      logger.warn(`cleanupWSFolder: ${config.runnerWorkspacePath} is not a directory`);
      return;
    }

    const items = await fs.promises.readdir(config.runnerWorkspacePath, { withFileTypes: true });
    // Delete eligible items in parallel
    await Promise.all(
      items
        .filter(item => item.isFile() && /\.(txt|xml|zip)$/i.test(item.name))
        .map(async (item) => {
          const fullPath = path.join(config.runnerWorkspacePath, item.name);
          try {
            await fs.promises.rm(fullPath, { recursive: true, force: true });
          } catch (error) {
            logger.warn(`cleanupWSFolder: Failed to delete ${fullPath}: ${error}`);
          }
        })
    );
  } catch (error) {
    logger.warn(`cleanupWSFolder: ${error}`);
  }
};

const RUN_TYPE_MAP: Record<string, RunType> = {
  'filesystem': RunType.FS,
  'filesystem-parallel': RunType.FSParallel,
  'alm': RunType.ALM,
  'alm-lab': RunType.ALMLab
};

const validateAndGetRunType = (): RunType => {
  const raw = config.runType.toLowerCase();
  const runType = RUN_TYPE_MAP[raw];

  if (runType === undefined) {
    throw new Error(`Invalid runType value '${raw}'. Allowed: ${Object.keys(RUN_TYPE_MAP).join(', ')}`);
  }

  logger.debug(`validateAndGetRunType: '${raw}' => RunType.${RunType[runType]}`);
  return runType;
}

const validateAndGetTestPaths = async (): Promise<string[]> => {
  if (!config.testPaths) {
    throw new Error(`Missing testPaths value`);
  }

  const rawPaths: string[] = config.testPaths.split('\n').filter(p => p.length > 0);

  if (rawPaths.length === 0) {
    throw new Error(`Invalid testPaths value '${config.testPaths}'`);
  }

  const testPaths: string[] = rawPaths.map(p => {
    if (path.isAbsolute(p)) {
      return p;
    }
    // Relative path: resolve via repository root
    return path.join(config.repo, p);
  });

  const missing: string[] = testPaths.filter(p => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(`The following test paths do not exist:\n${missing.join('\n')}`);
  }

  logger.debug(`validateAndGetTestPaths: resolved test paths:`);
  testPaths.forEach(p => logger.debug(`[${p}]`));
  return testPaths;
}

/*const createSymLink = async (target: string, branch: string): Promise<void> => {
  logger.debug(`createSymLink: target = [${target}], branch = [${branch}]`);
  const linkDir = `${config.repo}-${branch.replace(/[\\/:*?"<>|]/g, '_')}`;
  const linkPath = path.join(config.tmpDirPath, linkDir);
  try {
    await fs.promises.lstat(linkPath);
    // Link exists — check if the target it points to is still valid
    try {
      await fs.promises.stat(linkPath); // follows the symlink
      logger.debug(`createSymLink: link already exists: [${linkPath}]`);
    } catch { // Dangling symlink — target is gone, recreate it
      logger.warn(`createSymLink: dangling link detected [${linkPath}], recreating ...`);
      await fs.promises.unlink(linkPath);
      await fs.promises.symlink(target, linkPath, 'junction');
      logger.info(`createSymLink: link recreated: [${linkPath}]`);
    }
  } catch {
    logger.debug(`createSymLink: creating link [${linkPath}] -> [${target}] ...`);
    await fs.promises.symlink(target, linkPath, 'junction');
    logger.info(`createSymLink: link created: [${linkPath}]`);
  }
}

const checkoutRepoAndCreateSymLink = async (workDir: string, branch: string): Promise<void> => {
  await checkoutRepo(workDir);
  await createSymLink(workDir, branch);
}*/
