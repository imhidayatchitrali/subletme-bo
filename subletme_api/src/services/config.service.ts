import { Client } from '../database';
import { IAppVersion, Environment } from '../models/config.model';
import Logger from '../utils/logger';

type UpdateVersionParams = {
    id: number;
    version: string;
    iosBuildNumber?: number;
    androidBuildNumber?: number;
    environment: Environment;
    requiredUpdate?: boolean;
    message?: string;
    iosDownloadUrl?: string;
    androidDownloadUrl?: string;
};

class ConfigService {
    private client: Client;
    private context: string;
    constructor() {
        this.context = 'ConfigService';
        this.client = new Client();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public async getLatestVersion(environment: string): Promise<IAppVersion> {
        const methodContext = this.context + ' - getLatestVersion';
        try {
            Logger.info('Fetching latest version', methodContext, {
                environment,
            });
            const query = `
                SELECT * FROM app_version 
                WHERE environment = $1 
                ORDER BY id DESC 
                LIMIT 1
            `;

            const result = await this.client.query(query, [environment]);

            if (result.rows.length === 0) {
                Logger.error('No version found', methodContext, environment);
                throw new Error(
                    `No version found for environment: ${environment}`,
                );
            }

            // Transform from snake_case to camelCase
            const version = result.rows[0];
            Logger.info('Latest version fetched successfully', methodContext, {
                environment,
                version: version.version,
                id: version.id,
            });
            return {
                id: version.id,
                version: version.version,
                iosBuildNumber: version.ios_build_number,
                androidBuildNumber: version.android_build_number,
                environment: version.environment,
                updatedAt: version.updated_at,
                requiredUpdate: version.required_update,
                message: version.message,
                iosDownloadUrl: version.ios_download_url,
                androidDownloadUrl: version.android_download_url,
            };
        } catch (error: any) {
            Logger.error('Error fetching version:', methodContext, error);
            throw new Error(`Failed to fetch app version: ${error.message}`);
        }
    }

    public async updateVersion(
        params: UpdateVersionParams,
    ): Promise<IAppVersion> {
        const methodContext = this.context + ' - updateVersion';
        try {
            const {
                version,
                iosBuildNumber,
                androidBuildNumber,
                environment,
                requiredUpdate = false,
                message,
                iosDownloadUrl,
                androidDownloadUrl,
            } = params;
            Logger.info('Updating version', methodContext, {
                environment,
                version,
                iosBuildNumber,
                androidBuildNumber,
            });

            // First check if a record exists for this environment
            Logger.info(
                'Checking if version exists for environment',
                methodContext,
                { environment },
            );
            const checkQuery = `
                SELECT id FROM app_version 
                WHERE environment = $1 
                LIMIT 1
            `;
            const checkResult = await this.client.query(checkQuery, [
                environment,
            ]);

            let query, queryParams;
            const updateFields = [];
            const updateValues = [];
            const insertFields = [];
            const insertParams = [];
            const insertPlaceholders = [];
            let paramCounter = 1;

            // Only add defined parameters to the query
            if (version !== undefined) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(`version = $${paramCounter}`);
                }
                updateValues.push(version);
                insertFields.push('version');
                insertParams.push(version);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (iosBuildNumber) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(`ios_build_number = $${paramCounter}`);
                }
                updateValues.push(iosBuildNumber);
                insertFields.push('ios_build_number');
                insertParams.push(iosBuildNumber);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (androidBuildNumber) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(
                        `android_build_number = $${paramCounter}`,
                    );
                }
                updateValues.push(androidBuildNumber);
                insertFields.push('android_build_number');
                insertParams.push(androidBuildNumber);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            // environment is required for both update and insert
            if (checkResult.rows.length > 0) {
                // For update, environment is in WHERE clause
                Logger.info(
                    'Version exists, will perform UPDATE operation',
                    methodContext,
                    { environment },
                );
            } else {
                Logger.info(
                    'Version does not exist, will perform INSERT operation',
                    methodContext,
                    { environment },
                );
                insertFields.push('environment');
                insertParams.push(environment);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (requiredUpdate !== undefined) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(`required_update = $${paramCounter}`);
                }
                updateValues.push(requiredUpdate);
                insertFields.push('required_update');
                insertParams.push(requiredUpdate);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (message !== undefined) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(`message = $${paramCounter}`);
                }
                updateValues.push(message);
                insertFields.push('message');
                insertParams.push(message);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (iosDownloadUrl !== undefined) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(`ios_download_url = $${paramCounter}`);
                }
                updateValues.push(iosDownloadUrl);
                insertFields.push('ios_download_url');
                insertParams.push(iosDownloadUrl);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (androidDownloadUrl !== undefined) {
                if (checkResult.rows.length > 0) {
                    updateFields.push(
                        `android_download_url = $${paramCounter}`,
                    );
                }
                updateValues.push(androidDownloadUrl);
                insertFields.push('android_download_url');
                insertParams.push(androidDownloadUrl);
                insertPlaceholders.push(`$${paramCounter}`);
                paramCounter++;
            }

            if (checkResult.rows.length > 0) {
                // Always update updated_at timestamp
                updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

                // Add environment as the last parameter for the WHERE clause
                updateValues.push(environment);

                // Build UPDATE query
                query = `
                    UPDATE app_version 
                    SET ${updateFields.join(', ')}
                    WHERE environment = $${paramCounter}
                    RETURNING *
                `;
                queryParams = updateValues;
            } else {
                // Build INSERT query
                query = `
                    INSERT INTO app_version (
                        ${insertFields.join(', ')}
                    ) VALUES (${insertPlaceholders.join(', ')})
                    RETURNING *
                `;
                queryParams = insertParams;
            }

            Logger.info('Executing database operation', methodContext);
            const result = await this.client.query(query, queryParams);

            // Transform from snake_case to camelCase
            const updatedVersion = result.rows[0];
            Logger.info('Version updated successfully', methodContext, {
                environment,
                version: updatedVersion.version,
                id: updatedVersion.id,
            });
            return {
                id: updatedVersion.id,
                version: updatedVersion.version,
                iosBuildNumber: updatedVersion.ios_build_number,
                androidBuildNumber: updatedVersion.android_build_number,
                environment: updatedVersion.environment,
                updatedAt: updatedVersion.updated_at,
                requiredUpdate: updatedVersion.required_update,
                message: updatedVersion.message,
                iosDownloadUrl: updatedVersion.ios_download_url,
                androidDownloadUrl: updatedVersion.android_download_url,
            };
        } catch (error: any) {
            Logger.error('Error updating version:', methodContext, error);
            throw new Error(`Failed to update app version: ${error.message}`);
        }
    }
}

export default ConfigService;
