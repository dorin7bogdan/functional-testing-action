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
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/config.js';
import { SuiteResult } from './SuiteResult.js';
import Logger from '../utils/logger.js';

const logger: Logger = new Logger('TestResult');
export class TestResult {
  public suites: SuiteResult[];
  public keepLongStdio: boolean;
  public duration: number;

  constructor(keepLongStdio: boolean = false) {
    this.suites = [];
    this.keepLongStdio = keepLongStdio;
    this.duration = 0;
  }

  public async parsePossiblyEmpty(xmlResFileName: string): Promise<void> {
    const xmlResFullPath = path.join(config.runnerWsPath, xmlResFileName);
    if (fs.statSync(xmlResFullPath).size === 0) {
      const sr = new SuiteResult(xmlResFileName);
      this.add(sr);
    } else {
      await this.parse(xmlResFullPath);
    }
  }

  private async parse(xmlResFullPath: string): Promise<void> {
    logger.debug(`parse: Parsing XML file "${xmlResFullPath}", keepLongStdio=${this.keepLongStdio} ...`);
    try {
      for (const suiteResult of await SuiteResult.parse(xmlResFullPath, this.keepLongStdio)) {
        this.add(suiteResult);
      }
    } catch (e) {
      logger.error(`parse: Failed to parse [${xmlResFullPath}]`, e as Error);
    }
  }

  private add(sr: SuiteResult): void {
    for (const s of this.suites) {
      if (s.name === sr.name) {
        if (s.timestamp === sr.timestamp) {
          return;
        }

        this.duration += sr.duration;
        s.merge(sr);
        return;
      }
    }

    this.suites.push(sr);
    this.duration += sr.duration;
  }

  public toXML(): string {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
    xml += '<result>\n';
    xml += `\t<keepLongStdio>${this.keepLongStdio}</keepLongStdio>\n`;
    xml += `\t<duration>${this.duration.toFixed(5)}</duration>\n`;
    xml += '\t<suites>\n';
    for (const suite of this.suites) {
      xml += suite.toXML(2); // Indent suite elements by 2 tabs
    }
    xml += '\t</suites>\n';
    xml += '</result>\n';
    return xml;
  }
}