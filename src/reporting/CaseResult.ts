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
import { SuiteResult } from './SuiteResult.js';
import { escapeXML, parseTimeToFloat } from '../utils/utils.js';

export default class CaseResult {
  public duration: number;
  public className: string;
  public testName: string;
  public skipped: boolean;
  public skippedMessage: string|null;
  public stdout: string|null;
  public stderr: string|null;
  public errorStackTrace: string = "";
  public errorDetails: string = "";
  public parent: SuiteResult;
  public reportPath: string|undefined;

  constructor(parent: SuiteResult, attrs: any) {
    let classname = attrs.classname as string ?? parent.name;
    let nameAttr = attrs.name;
    if (!classname && nameAttr.contains(".")) {
      classname = nameAttr.substring(0, nameAttr.lastIndexOf('.'));
      nameAttr = nameAttr.substring(nameAttr.lastIndexOf('.') + 1);
    }

    this.className = classname ?? "unnamed";
    this.testName = nameAttr;
    this.parent = parent;
    this.stdout = null;
    this.stderr = null;
    this.duration = parseTimeToFloat(attrs.time);
    this.skipped = false;
    this.skippedMessage = null;
    this.reportPath = attrs.report;
  }

  public toXML(indent: number = 2): string {
    const tabs = "\t".repeat(indent);
    let xml = `${tabs}<case>\n`;
    xml += `${tabs}\t<duration>${this.duration.toFixed(5)}</duration>\n`;
    xml += `${tabs}\t<className>${escapeXML(this.className)}</className>\n`;
    xml += `${tabs}\t<testName>${escapeXML(this.testName)}</testName>\n`;
    xml += `${tabs}\t<skipped>${this.skipped}</skipped>\n`;
    xml += `${tabs}\t<skippedMessage>${escapeXML(this.skippedMessage)}</skippedMessage>\n`;
    xml += `${tabs}\t<stdout>${escapeXML(this.stdout)}</stdout>\n`;
    xml += `${tabs}\t<errorStackTrace>${escapeXML(this.errorStackTrace)}</errorStackTrace>\n`;
    xml += `${tabs}\t<errorDetails>${escapeXML(this.errorDetails)}</errorDetails>\n`;
    xml += `${tabs}</case>\n`;
    return xml;
  }
}