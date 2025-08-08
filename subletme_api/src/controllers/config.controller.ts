import { Request, Response } from 'express';
import PropertyService from '../services/property.service';
import { IResponseData } from '../models/property.model';
import LocationService from '../services/location.service';
import ConfigService from '../services/config.service';
import { IAppVersionResponse } from '../models/config.model';
import Logger from '../utils/logger';

class ConfigController {
    private service: ConfigService;
    private propertyService: PropertyService;
    private locationService: LocationService;
    private context: string;

    constructor() {
        this.context = 'ConfigController';
        this.service = new ConfigService();
        this.propertyService = new PropertyService();
        this.locationService = new LocationService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public getData = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getData';
        try {
            Logger.info('Starting', methodContext);

            Logger.info('Fetching place types', methodContext);
            const types = await this.propertyService.getPlaceTypes();
            if (!types) {
                Logger.error('Types not found', methodContext);
                throw new Error('Types not found');
            }

            Logger.info('Fetching amenities', methodContext);
            const amenities = await this.propertyService.getAmenities();
            if (!amenities) {
                Logger.error('Amenities not found', methodContext);
                throw new Error('Amenities not found');
            }

            Logger.info('Fetching styles', methodContext);
            const styles = await this.propertyService.getStyles();
            if (!styles) {
                Logger.error('Styles not found', methodContext);
                throw new Error('Styles not found');
            }

            Logger.info('Fetching rules', methodContext);
            const rules = await this.propertyService.getRules();
            if (!rules) {
                Logger.error('Rules not found', methodContext);
                throw new Error('Rules not found');
            }

            Logger.info('Fetching locations', methodContext);
            const locations = await this.locationService.getLocations();
            if (!locations) {
                Logger.error('Locations not found', methodContext);
                throw new Error('Locations not found');
            }

            const response: IResponseData = {
                types,
                amenities,
                styles,
                rules,
                locations,
            };

            Logger.info('Successfully fetched all data', methodContext, {
                typesCount: types.length,
                amenitiesCount: amenities.length,
                stylesCount: styles.length,
                rulesCount: rules.length,
                locationsCount: locations.length,
            });

            res.status(200).json(response);
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);
            res.status(400).json({ message: e.message ?? 'Error' });
        }
    };

    public getLocations = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getLocations';
        try {
            Logger.info('Starting', methodContext);

            const locations = await this.locationService.getLocations();
            if (!locations) {
                Logger.error('Locations not found', methodContext);
                throw new Error('Locations not found');
            }

            Logger.info('Successfully fetched locations', methodContext, {
                count: locations.length,
            });

            res.status(200).json({
                locations: locations,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);
            res.status(400).json({ message: e.message ?? 'Error' });
        }
    };

    public getFilters = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getFilters';
        try {
            Logger.info('Starting', methodContext);

            const types = await this.propertyService.getPlaceTypes();
            if (!types) {
                Logger.error('Types not found', methodContext);
                throw new Error('Types not found');
            }

            Logger.info('Successfully fetched place types', methodContext, {
                count: types.length,
            });

            res.status(200).json({
                place_types: types,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);
            res.status(400).json({ message: e.message ?? 'Error' });
        }
    };

    public updateVersion = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - updateVersion';
        try {
            Logger.info('Starting', methodContext);

            const {
                version,
                iosBuildNumber,
                androidBuildNumber,
                environment,
                requiredUpdate,
            } = req.body;

            Logger.info('Request data', methodContext, {
                version,
                iosBuildNumber,
                androidBuildNumber,
                environment,
                requiredUpdate,
            });

            Logger.info('Fetching latest version', methodContext, {
                environment,
            });
            const appVersion = await this.service.getLatestVersion(environment);

            if (!appVersion) {
                Logger.error(
                    'Version not found for environment',
                    methodContext,
                    { environment },
                );
                throw new Error('Version not found');
            }

            Logger.info('Updating version', methodContext, {
                id: appVersion.id,
                version,
            });

            await this.service.updateVersion({
                id: appVersion.id,
                version,
                iosBuildNumber,
                androidBuildNumber,
                environment,
                requiredUpdate,
            });

            Logger.info('Successfully updated version', methodContext, {
                id: appVersion.id,
            });

            res.status(200).json({
                success: true,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);
            res.status(400).json({ message: e.message ?? 'Error' });
        }
    };

    public getVersion = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getVersion';
        try {
            Logger.info('Starting', methodContext);

            const environment = req.query.environment as string;
            const platform = req.query.platform as string;

            Logger.info('Request params', methodContext, {
                environment,
                platform,
            });

            // Better validation
            if (!environment) {
                Logger.error('Missing environment parameter', methodContext);
                return res
                    .status(400)
                    .json({ message: 'Environment is required' });
            }

            if (!platform || !['ios', 'android'].includes(platform)) {
                Logger.error('Invalid platform parameter', methodContext, {
                    platform,
                });
                return res.status(400).json({
                    message: 'Valid platform (ios or android) is required',
                });
            }

            Logger.info('Fetching latest version', methodContext, {
                environment,
            });
            const appVersion = await this.service.getLatestVersion(environment);

            if (!appVersion) {
                Logger.error(
                    'Version not found for environment',
                    methodContext,
                    { environment },
                );
                return res.status(404).json({ message: 'Version not found' });
            }

            // Create base response
            const result: IAppVersionResponse = {
                version: appVersion.version,
                build_number:
                    platform === 'ios'
                        ? appVersion.iosBuildNumber
                        : appVersion.androidBuildNumber,
                environment: appVersion.environment,
                required_update: appVersion.requiredUpdate,
                message: appVersion.message,
                download_url:
                    platform === 'ios'
                        ? appVersion.iosDownloadUrl
                        : appVersion.androidDownloadUrl,
            };

            Logger.info('Successfully fetched version', methodContext, {
                version: result.version,
                buildNumber: result.build_number,
                requiredUpdate: result.required_update,
            });

            return res.status(200).json(result);
        } catch (error: any) {
            Logger.error(
                error.message || 'Internal server error',
                methodContext,
            );
            return res.status(500).json({
                success: false,
                message: error.message || 'Internal server error',
            });
        }
    };

    public completeLocations = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - completeLocations';
        try {
            Logger.info('Starting', methodContext);

            await this.locationService.populateAllCityCoordinates();

            Logger.info('Successfully completed locations', methodContext);

            res.status(200).json({
                success: true,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);
            res.status(400).json({ message: e.message ?? 'Error' });
        }
    };
}

export default ConfigController;
