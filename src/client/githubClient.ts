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
import * as fs from 'fs';
import { DefaultArtifactClient } from '@actions/artifact';
import { getOctokit, context } from '@actions/github';
import { Logger } from '../utils/logger.js';
import { config } from '../config/config.js';

const _owner_repo = { owner: config.owner, repo: config.repo };
export default class GitHubClient {
  private static logger: Logger = new Logger('githubClient');

  private static octokit = getOctokit(config.githubToken);
  private static artifactClient = new DefaultArtifactClient();

  public static uploadArtifact = async (parentPath: string, paths: string[], artifactName: string, skipInvalidPaths: boolean = true): Promise<number> => {
    try {
      let filesToUpload: string[] = [];
      this.logger.debug(`uploadArtifact: parentPath='${parentPath}', paths.length=${paths.length}, artifactName='${artifactName}' ...`);

      for (const fileOrDirFullPath of paths) {
        if (!fs.existsSync(fileOrDirFullPath)) {
          this.logger.error(`Path does not exist: ${fileOrDirFullPath}`);
          if (!skipInvalidPaths) {
            throw new Error(`Path does not exist: ${fileOrDirFullPath}`);
          }
          continue;
        }
        // Determine if the path is a file or directory
        const stats = fs.statSync(fileOrDirFullPath);
        if (stats.isFile()) {
          filesToUpload.push(fileOrDirFullPath);
        } else if (stats.isDirectory()) { // Recursively collect all files in the directory
          filesToUpload = filesToUpload.concat(this.walkDir(fileOrDirFullPath));
        } else {
          this.logger.error(`Path is neither a file nor a directory: ${fileOrDirFullPath}`);
          if (!skipInvalidPaths) {
            throw new Error(`Path is neither a file nor a directory: ${fileOrDirFullPath}`);
          }
          continue;
        }
      }

      this.logger.debug(`Uploading artifact ${artifactName} with ${filesToUpload.length} file(s)`);
      const res = await this.artifactClient.uploadArtifact(artifactName, filesToUpload, parentPath);

      this.logger.info(`Artifact ${res.id} uploaded successfully.`);
      return res.id ?? 0;
    } catch (error) {
      this.logger.error(`uploadArtifact: ${error instanceof Error ? error.message : String(error)}`);
      return -1;
    }
  };

  private static walkDir(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results = results.concat(this.walkDir(filePath));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }

  public static downloadArtifact = async (artifactId: number): Promise<ArrayBuffer> => {
    this.logger.info(`downloadArtifact: artifactId='${artifactId}' ...`);

    return <ArrayBuffer>(await this.octokit.rest.actions.downloadArtifact({
      ..._owner_repo, artifact_id: artifactId, archive_format: 'zip'
    })
    ).data;
  };

  public static cancelWorkflowRun = async (): Promise<void> => {
    this.logger.info(`cancelWorkflowRun: run_id='${context.runId}' ...`);
    try {
      await this.octokit.rest.actions.cancelWorkflowRun({
        owner: config.owner,
        repo: config.repo,
        run_id: context.runId
      });
    } catch (e: any) {
      this.logger.error(`Cancel request failed: ${e.message}`);
    }
  }
}
