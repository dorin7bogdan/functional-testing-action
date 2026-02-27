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
import { Logger } from '../utils/logger.js';
import { ExitCode } from './ExitCode.js';
import FTL from './FTL.js';
import { checkFileExists, checkReadWriteAccess, escapePropVal, getTimestamp } from '../utils/utils.js';
import { config } from '../config/config.js';

const logger = new Logger('FtTestExecuter');

export default class FtTestExecuter {
  public static async process(testPaths: string[]): Promise<{ exitCode: ExitCode, resFullPath: string, propsFullPath: string, mtbxFullPath: string }> {
    logger.debug(`process: testPaths.length=${testPaths.length} ...`);
    await checkReadWriteAccess(config.runnerWorkspacePath);
    const suffix = getTimestamp();
    const { propsFullPath, resFullPath, mtbxFullPath } = await this.createPropsFile(suffix, testPaths);
    await checkFileExists(propsFullPath);
    const actionBinPath = await FTL.ensureToolExists();
    const exitCode = await FTL.runTool(actionBinPath, propsFullPath);
    logger.debug(`process: exitCode=${exitCode}`);
    return { exitCode, resFullPath, propsFullPath, mtbxFullPath };
  }

  private static async createPropsFile(suffix: string, testPaths: string[]): Promise<{ propsFullPath: string, resFullPath: string, mtbxFullPath: string }> {
    const propsFullPath = path.join(config.runnerWorkspacePath, FTL._TMP, `props_${suffix}.txt`);
    const resFullPath = path.join(config.runnerWorkspacePath, FTL._TMP, `results_${suffix}.xml`);
    const mtbxFullPath = path.join(config.runnerWorkspacePath, FTL._TMP, `testsuite_${suffix}.mtbx`);

    logger.debug(`createPropsFile: [${propsFullPath}] ...`);
    await this.createMtbxFile(mtbxFullPath, testPaths);
    await checkFileExists(mtbxFullPath);
    const props: { [key: string]: string } = {
      runType: FTL.FileSystem,
      Test1: escapePropVal(mtbxFullPath),
      resultsFilename: escapePropVal(resFullPath)
    };

    if (config.labUrl && config.labExecToken) {
      props["MobileHostAddress"] = config.labUrl;
      props["MobileExecToken"] = config.labExecToken;
      // TODO props["MobileExecDescription"] = `${config.mobileExecDescription} Test: ${testName}`;
    }
    try {
      await fs.writeFile(propsFullPath, Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n'));
    } catch (error: any) {
      logger.error(`createPropsFile: ${error.message}`);
      throw new Error('Failed when creating properties file');
    }

    return { propsFullPath, resFullPath, mtbxFullPath };
  }

  private static async createMtbxFile(mtbxFullPath: string, testPaths: string[]): Promise<string> {
    logger.debug(`createMtbxFile: [${mtbxFullPath}]`);
    let xml = "<Mtbx>\n";
    testPaths.map(async (testPath, i) => {
      const name = path.basename(testPath);
      //const fullPath = path.join(config.runnerWorkspacePath, name);
      xml += `\t<Test name="${name}" path="${testPath}" />\n`;
    });
    xml += `</Mtbx>`;

    await fs.writeFile(mtbxFullPath, xml, 'utf8');
    return mtbxFullPath;
  }

}