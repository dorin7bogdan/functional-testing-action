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
import Logger from './utils/logger.js';
import * as path from 'path';
import GitHubClient from './client/githubClient.js';
import { ExitCode } from './ft/ExitCode.js';
import FtTestExecuter from './ft/FtTestExecuter.js';
import * as fs from 'fs-extra';
import JUnitParser from './reporting/JUnitParser.js';
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

  await checkoutRepo(workDir);

  const runType = validateAndGetRunType();
  const testPaths = await validateAndGetTestPaths();
  const exitCode = await run();
  //TODO use exitCode ?

  logger.info(`END handleEvent. ExitCode=${exitCode}`);
  // END of handleCurrentEvent function

  async function run(): Promise<ExitCode> {
    logger.debug(`BEGIN run: ...`);
    let propsFullPath: string | undefined;
    let resFullPath: string | undefined;
    let junitFullPath: string | undefined;
    try {
      const repoFolderPath = workDir;

      ({ propsFullPath, resFullPath } = await FtTestExecuter.preProcess(runType, testPaths));
      const exitCode = await FtTestExecuter.process(propsFullPath);
      junitFullPath = await buildJUnitReport(resFullPath);
      await uploadArtifacts(propsFullPath, resFullPath, junitFullPath);
      logger.info(`END run: ExitCode=${exitCode}.`);
      return exitCode;
    } catch (error) {
      logger.error(`run: ${error}`);
      return ExitCode.Aborted;
    } finally {
      await cleanupTempFiles([propsFullPath, resFullPath].filter((f): f is string => f !== undefined));
      logger.error(`END run.`);
    }
  }
};

const uploadArtifacts = async (propsFullPath: string, resFullPath: string, junitFullPath: string) => {
  logger.debug(`uploadArtifacts: propsFullPath=[${propsFullPath}], resFullPath=[${resFullPath}], junitFullPath=[${junitFullPath}] ...`);
  await GitHubClient.uploadArtifact(config.runnerWorkspacePath, [propsFullPath], `props-txt`);
  await GitHubClient.uploadArtifact(config.runnerWorkspacePath, [resFullPath], `results-xml`);
  await GitHubClient.uploadArtifact(config.runnerWorkspacePath, [junitFullPath], `junit-xml`);
}

const cleanupTempFiles = async (fullPathFiles: string[]) => {
  logger.debug(`cleanupTempFiles: ${fullPathFiles.join(', ')} ...`);
  await Promise.all(fullPathFiles.map(async (fullPathFile) => {
    try {
      await fs.promises.rm(fullPathFile, { force: true });
    } catch (error) {
      logger.warn(`cleanupTempFiles: Failed to delete ${fullPathFile}: ${error}`);
    }
  }));
}

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

  const rawPaths: string[] = config.testPaths;

  if (rawPaths.length === 0) {
    throw new Error(`Invalid testPaths value '${config.testPaths}'`);
  }

  const testPaths: string[] = rawPaths.map(p => {
    if (path.isAbsolute(p)) {
      return p;
    }
    // Relative path: just append the repo name as prefix (e.g., "quicks/test1" => "ufto-tests/quicks/test1")
    return path.join(config.repo, p);
  });

  const missing: string[] = testPaths.filter(p => !fs.existsSync(path.resolve(config.runnerWorkspacePath, p)));
  if (missing.length > 0) {
    throw new Error(`The following test paths do not exist:\n${missing.join('\n')}`);
  }

  logger.debug(`validateAndGetTestPaths: resolved test paths:`);
  testPaths.forEach(p => logger.debug(`"${p}"`));
  return testPaths;
}

const buildJUnitReport = async (resFullPath: string): Promise<string> => {
  logger.info(`sendTestResults: "${resFullPath}" ...`);
  const parser = new JUnitParser(resFullPath);
  const junitRes = await parser.parseResult();
  const junitFullPath = path.join(config.runnerWorkspacePath, 'junit-results.xml');
  await fs.writeFile(junitFullPath, junitRes.toXML());
  return junitFullPath;
}
