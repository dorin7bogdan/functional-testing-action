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
import { spawn } from 'child_process';
import { ExitCode } from '../ft/ExitCode.js';
import * as fsp from 'fs/promises';
import path from "path";
import { Logger } from "../utils/logger.js";
import { config } from '../config/config.js';

const FTL_EXE = 'FTToolsLauncher.exe';
const logger = new Logger("FTL");

export default class FTL {
  public static readonly FileSystem = "FileSystem";
  public static readonly Alm = "Alm";
  public static readonly MBT = "MBT";
  public static async ensureToolExists(): Promise<void> {
    logger.debug(`ensureToolExists: Checking for ${FTL_EXE} ...`);
    const runnerWorkspace = config.runnerWorkspacePath;

    if (!runnerWorkspace) {
      const err = `Missing required environment variable: RUNNER_WORKSPACE`;
      logger.error(`ensureToolExists: ${err}`);
      throw new Error(err);
    }

    const exeFullPath = path.join(runnerWorkspace, FTL_EXE);

    try {
      await fsp.access(exeFullPath, fsp.constants.F_OK | fsp.constants.X_OK);
      logger.debug(`ensureToolExists: Located [${exeFullPath}]`);
      return;
    } catch {
      logger.debug(`ensureToolExists: "${exeFullPath}" not found, downloading from "${config.ftlUrl}" ...`);
    }

    if (!config.ftlUrl) {
      const err = `${FTL_EXE} not found and ftlUrl is not configured`;
      logger.error(`ensureToolExists: ${err}`);
      throw new Error(err);
    }

    try {
      const response = await fetch(config.ftlUrl);
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      await fsp.writeFile(exeFullPath, Buffer.from(buffer));
      await fsp.access(exeFullPath, fsp.constants.F_OK | fsp.constants.X_OK);

      logger.info(`ensureToolExists: Downloaded "${exeFullPath}"`);
      return;
    } catch (error) {
      const err = `Failed to download "${FTL_EXE}" from "${config.ftlUrl}": ${error}`;
      logger.error(`ensureToolExists: ${err}`);
      throw new Error(err);
    }
  }
  public static async runTool(propsFullPath: string): Promise<ExitCode> {
    logger.debug(`runTool: propsFullPath="${propsFullPath}" ...`);

    const args = ['-paramfile', propsFullPath];
    try {
      logger.info(`${FTL_EXE} ${args.join(' ')}`);

      return await new Promise<ExitCode>((resolve, reject) => {
        const launcher = spawn(FTL_EXE, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: config.runnerWorkspacePath, // Set working directory to temp folder
        });
        launcher.stdout.on('data', (data) => {
          const msg = data?.toString().trim();
          msg && logger.info(msg);
        });

        launcher.stderr.on('data', (data) => {
          const err = data?.toString().trim();
          err && logger.error(err);
        });

        launcher.on('error', (error) => {
          reject(new Error(`Failed to start FTTollsLauncher: ${error.message}`));
        });

        launcher.on('close', (code) => {
          // Node.js returns unsigned 32-bit for negative codes (e.g., -2 => 4294967294)
          // Normalize to signed 32-bit integer
          let normalizedCode: number;
          if (typeof code === 'number') {
            normalizedCode = code > 0x7FFFFFFF ? code - 0x100000000 : code;
          } else {
            logger.error('runTool: Process exited with null code (possibly killed by signal)');
            resolve(ExitCode.Aborted); // or another appropriate value
            return;
          }

          logger.debug(`runTool: ExitCode=${normalizedCode}`);
          const exitCode = Object.values(ExitCode).includes(normalizedCode)
            ? (normalizedCode as ExitCode)
            : ExitCode.Unknown;
          resolve(exitCode);
        });
      });
    } catch (error: any) {
      logger.error(`runTool: ${error.message}`);
      throw new Error(`Failed to run FTTollsLauncher: ${error.message}`);
    }
  }
}