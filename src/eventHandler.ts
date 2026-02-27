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
//import { UftoParamDirection } from './dto/ft/UftoParamDirection';
import * as path from 'path';
import GitHubClient from './client/githubClient.js';
//import TestParamsParser from './mbt/TestParamsParser';
import { ExitCode } from './ft/ExitCode.js';
import FtTestExecuter from './ft/FtTestExecuter.js';
import * as fs from 'fs';
import FTL from './ft/FTL.js';

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
  //const inputs = context.payload.inputs;
  //logger.debug(`Input params: ${JSON.stringify(inputs, null, 0)}`);
  //const wfis: WorkflowInputs = { executionId: inputs.executionId ?? '', suiteId: inputs.suiteId ?? '', suiteRunId: inputs.suiteRunId ?? '', testsToRun: inputs.testsToRun ?? '' };
  if (areParamsValid()) {
    const exitCode = await run();
    //TODO use exitCode ?
  } else {
    throw new Error(`Invalid or missing tests to run specified in the workflow`);
  }

  logger.info('END handleEvent ...');
  // END of handleCurrentEvent function

  async function run(): Promise<ExitCode> {
    logger.debug(`BEGIN run: ...`);

    const repoFolderPath = workDir;

    const tmpFullPath = path.join(config.runnerWorkspacePath, FTL._TMP);
    if (fs.existsSync(tmpFullPath)) {
      await cleanupTempFolder(tmpFullPath);
    } else {
      logger.debug(`creating ${tmpFullPath} ...`);
      await fs.promises.mkdir(tmpFullPath, { recursive: true });
    }

/*  const { ok, mbtPropsFullPath }  = await MbtPreTestExecuter.preProcess(mbtTestInfos);
    if (ok) {
      const { exitCode, resFullPath, propsFullPath, mtbxFullPath } = await FtTestExecuter.process(mbtTestInfos);
      const res = (exitCode === ExitCode.Passed ? Result.SUCCESS : (exitCode === ExitCode.Unstable ? Result.UNSTABLE : Result.FAILURE));
      await GitHubClient.uploadArtifact(config.runnerWorkspacePath, [mbtPropsFullPath, propsFullPath, mtbxFullPath, resFullPath], `temp_files`);
      logger.info(`END run: ExitCode=${exitCode}.`);
      return exitCode;
    }*/
    logger.error(`END run: Failed to execute tests. ExitCode=${ExitCode.Aborted}`);
    return ExitCode.Aborted;
  }
};

const cleanupTempFolder = async (tmpFullPath: string) => {
  logger.debug(`cleanupTempFolder: ${tmpFullPath}`);

  try {
    // Check if the path exists and is a directory
    const stats = await fs.promises.stat(tmpFullPath);
    if (!stats.isDirectory()) {
      logger.warn(`cleanupTempFolder: ${tmpFullPath} is not a directory`);
      return;
    }

    const items = await fs.promises.readdir(tmpFullPath, { withFileTypes: true });

    // Delete all items in parallel
    await Promise.all(
      items.map(async (item) => {
        const fullPath = path.join(tmpFullPath, item.name);
        try {
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        } catch (error) {
          logger.warn(`cleanupTempFolder: Failed to delete ${fullPath}: ${error}`);
        }
      })
    );
  } catch (error) {
    logger.warn(`cleanupTempFolder: ${error}`);
  }
};

const areParamsValid = (): boolean => {
  if (config.testsPath) {
    const testPaths: string[] = config.testsPath.split(/[;\n]/).map(p => p.trim()).filter(p => p.length > 0);
    if (testPaths.length === 0) {
      throw new Error(`Invalid testsPath value`);
    }
  } else {
    throw new Error(`Missing testsPath value`);
  }
  return true;
}