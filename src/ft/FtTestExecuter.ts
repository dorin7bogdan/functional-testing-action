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
import * as path from 'path';
import { promises as fs } from 'fs';
import Logger from '../utils/logger.js';
import { ExitCode } from './ExitCode.js';
import FTL from './FTL.js';
import { checkFileExists, checkReadWriteAccess, escapePropVal, getTimestamp } from '../utils/utils.js';
import { config } from '../config/config.js';
import { RunType } from '../dto/RunType.js';

const logger = new Logger('FtTestExecuter');

export default class FtTestExecuter {
  public static async preProcess(runType: RunType, testPaths: string[]): Promise<{ propsFileName: string, xmlResFileName: string }> {
    logger.debug(`preProcess ...`);
    await checkReadWriteAccess(config.runnerWsPath);
    const suffix = getTimestamp();
    const isParallel = runType === RunType.FSParallel;
    const runtype = runType === RunType.ALM ? FTL.Alm : FTL.FileSystem;
    return await this.createPropsFile(runtype, suffix, testPaths, isParallel);
  }

  public static async process(propsFileName: string): Promise<ExitCode> {
    logger.debug(`process: propsFileName = "${propsFileName}" ...`);
    const propsFullPath = path.join(config.runnerWsPath, propsFileName);
    await checkFileExists(propsFullPath);
    await checkReadWriteAccess(config.runnerWsPath);
    await FTL.ensureToolExists();
    const exitCode = await FTL.runTool(propsFullPath);
    logger.debug(`process: exitCode=${exitCode}`);
    return exitCode;
  }

  private static async createPropsFile(runtype: string, suffix: string, testPaths: string[], isParallel: boolean = false): Promise<{ propsFileName: string, xmlResFileName: string }> {
    const propsFileName = `props_${suffix}.txt`;
    const xmlResFileName = `results_${suffix}.xml`;
    const propsFullPath = path.join(config.runnerWsPath, propsFileName);

    logger.debug(`createPropsFile: "${propsFileName}" ...`);

    const props: { [key: string]: string } = {
      runType: runtype,
      resultsFilename: xmlResFileName,
      cancelRunOnFailure: `${config.cancelRunOnFailure}`,
      resultTestNameOnly: `${config.resultTestNameOnly}`,
      resultUnifiedTestClassname: `${config.resultUnifiedTestClassname}`
    };
    for (let i = 0; i < testPaths.length; i++) {
      const key = `Test${i + 1}`;
      props[key] = escapePropVal(testPaths[i]);
    }

/*    if (config.labUrl && config.labExecToken) {
      props["MobileHostAddress"] = config.labUrl;
      props["MobileExecToken"] = config.labExecToken;
    }*/
    try {
      await fs.writeFile(propsFullPath, Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n'));
    } catch (error: any) {
      logger.error(`createPropsFile: ${error.message}`);
      throw new Error('Failed when creating properties file');
    }

    return { propsFileName, xmlResFileName };
  }

}