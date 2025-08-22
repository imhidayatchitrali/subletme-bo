import { Request, Response } from 'express';
import PropertyService from '../services/property.service';
import {
    IProperty,
    IPropertyPublishInput,
    IPropertyUpdateInput,
} from '../models/property.model';
import UserService from '../services/user.service';
import {
    checkForFilesAndReturn,
    uploadPhotoToMinio,
} from '../helpers/minio.helper';
import { getCoordinatesFromAddress } from '../helpers/location.helper';
import { FilterScenario } from '../utils/constants';
import { parseCityIds, parseNumericParam } from '../helpers/property.helper';
import NotificationService from '../services/notification.service';
import { NotificationPayload } from '../models/notification.model';
import Logger from '../utils/logger';
import LocationService from '../services/location.service';

class PropertyController {
    private service: PropertyService;
    private userService: UserService;
    private notificationService: NotificationService;
    private locationService: LocationService;
    private context: string;

    constructor() {
        this.context = 'PropertyController';
        this.service = new PropertyService();
        this.userService = new UserService();
        this.notificationService = new NotificationService();
        this.locationService = new LocationService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public publish = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - publish';
        try {
            Logger.info(
                `Starting with ${req.files?.length || 0} files`,
                methodContext,
            );

            const id = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId: id });

            const user = await this.userService.getUserMe(id);
            if (!user) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            const photosUrl: string[] = [];

            const input = {
                ...(req.body.data ? JSON.parse(req.body.data) : req.body),
            } as Partial<IPropertyPublishInput>;

            const cityFound = await this.locationService.getLocationById(
                input.location_item!.city_id,
            );

            const addressToLookFor = `${input.address} ${cityFound?.city_name}, ${cityFound?.state_name ?? ''}, ${cityFound?.country_name}`;
            Logger.info('Processing address', methodContext, {
                address: addressToLookFor,
            });

            // Gecolocation from address (latitude and longitude)
            const geo = await getCoordinatesFromAddress(addressToLookFor);
            Logger.info('Geocoding result', methodContext, {
                latitude: geo.latitude,
                longitude: geo.longitude,
            });

            input.latitude = geo.latitude;
            input.longitude = geo.longitude;

            const inputForLogging = { ...input };
            delete inputForLogging.photos;
            Logger.info(
                'Publishing property with data',
                methodContext,
                inputForLogging,
            );

            const resultId = await this.service.publishProperty(
                input as IPropertyPublishInput,
                user.id,
            );
            Logger.info('Property published', methodContext, {
                propertyId: resultId,
            });

            // Submit all the images and save urls
            // const fileData = checkForFilesAndReturn(
            //     req.files ?? req.body.photos,
            // );
            // Logger.info('Processing files', methodContext, {
            //     fileCount: fileData.length,
            // });

            // let indexImage = 0;
            // for (const file of fileData) {
            //     const filePath = `properties/${resultId}`;
            //     const fileName = `${indexImage + 1}.${file.type}`;
            //     Logger.info('Uploading image', methodContext, {
            //         imageIndex: indexImage + 1,
            //         filePath,
            //         fileName,
            //     });

            //     const url = await uploadPhotoToMinio(
            //         file.buffer,
            //         filePath,
            //         fileName,
            //     );
            //     Logger.info('Image uploaded successfully', methodContext, {
            //         url,
            //     });

            //     indexImage++;
            //     photosUrl.push(url);
            // }

            Logger.info('Saving property photos', methodContext, {
                photoCount: photosUrl.length,
            });
            await this.service.savePropertyPhotos(resultId, photosUrl);

            Logger.info('Property published successfully', methodContext);
            res.status(200).json({
                message: 'Property published',
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error publishing property',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error publishing property',
            });
        }
    };

    public getProperties = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getProperties';
        try {
            Logger.info('Fetching with params', methodContext, req.query);

            const userId = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId });

            // Extract all possible filter parameters
            const distance = null;
            // Parse query parameters with validation
            const city_ids = parseCityIds(
                req.query.city_ids as string | undefined,
            );
            const min_price = parseNumericParam(
                req.query.min_price as string | undefined,
            );
            const max_price = parseNumericParam(
                req.query.max_price as string | undefined,
            );

            const date_start = parseNumericParam(
                req.query.date_start as string | undefined,
            );
            const date_end = parseNumericParam(
                req.query.date_end as string | undefined,
            );

            // Parameters where zero values should be ignored
            const bathrooms = parseNumericParam(
                req.query.bathrooms as string | undefined,
                true,
            );
            const bedrooms = parseNumericParam(
                req.query.bedrooms as string | undefined,
                true,
            );

            // Handle array parameters
            const placeTypes = req.query.place_types
                ? (req.query.place_types as string)
                      .split(',')
                      .filter((type) => type.trim() !== '')
                : undefined;

            const options = req.query.options // roommates, parking_spot
                ? (req.query.options as string)
                      .split(',')
                      .filter((o) => o.trim() !== '')
                : undefined;

            // Handle boolean parameters
            const furnished =
                req.query.furnished === 'true'
                    ? true
                    : req.query.furnished === 'false'
                      ? false
                      : undefined;

            // Additional filters can be added here
            const filters = {
                distance,
                city_ids,
                min_price,
                max_price,
                date_start,
                date_end,
                bathrooms,
                bedrooms,
                placeTypes,
                furnished,
                options,
            };

            Logger.info('Applied filters', methodContext, filters);

            const user = await this.userService.getUserMe(userId);
            if (!user) {
                Logger.error('User not found', methodContext, { userId });
                throw new Error('User not found');
            }

            let resultCode;
            let properties: IProperty[] = [];

            // Use a single unified method to get properties by filters
            Logger.info('Getting properties by filters', methodContext, {
                userLocation: user.location,
            });

            properties = await this.service.getPropertiesByFilters(
                userId,
                user.location,
                filters,
            );

            // If there are no properties, bring default properties
            if (properties.length === 0) {
                Logger.info(
                    'No properties found with filters, fetching defaults',
                    methodContext,
                );
                resultCode = FilterScenario.FILTERS_EMPTY;
                properties = await this.service.getProperties(userId);
            } else {
                Logger.info('Found properties with filters', methodContext, {
                    count: properties.length,
                });
                resultCode = FilterScenario.FILTERS_APPLIED;
            }

            Logger.info('Returning properties', methodContext, {
                count: properties.length,
                resultCode,
            });

            res.status(200).json({
                total: properties.length,
                result_code: resultCode,
                properties: properties,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error fetching properties',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error fetching properties',
            });
        }
    };

    public getPropertyDetails = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getPropertyDetails';
        try {
            const { id } = req.params;
            Logger.info('Fetching property details', methodContext, {
                propertyId: id,
            });

            const result = await this.service.getPropertyDetail(id);
            Logger.info('Successfully retrieved property', methodContext, {
                propertyId: id,
            });

            res.status(200).json({
                result,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error fetching property details',
                methodContext,
                {
                    propertyId: req.params.id,
                },
            );
            res.status(400).json({
                message: e.message ?? 'Error fetching properties',
            });
        }
    };

    public unlikeProperty = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - unlikeProperty';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            const { id } = req.params;
            Logger.info('Unliking property', methodContext, {
                userId,
                propertyId: id,
            });

            const result = await this.service.findPropertyById(id);

            if (!result) {
                Logger.error('Property not found', methodContext, {
                    propertyId: id,
                });
                throw new Error('Property not found');
            }

            await this.service.unlikeProperty(userId, id);
            Logger.info('Successfully unliked property', methodContext, {
                userId,
                propertyId: id,
            });

            res.status(200).json({
                result: true,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error on unlikeProperty', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error on unlikeProperty',
            });
        }
    };

    public likeProperty = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - likeProperty';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            const { id } = req.params;
            Logger.info('Liking property', methodContext, {
                userId,
                propertyId: id,
            });

            // Get the user
            const user = await this.userService.getUserMe(userId);
            if (!user) {
                Logger.error('User not found', methodContext, { userId });
                throw new Error('User not found');
            }

            const property = await this.service.findPropertyById(id);

            if (!property) {
                Logger.error('Property not found', methodContext, {
                    propertyId: id,
                });
                throw new Error('Property not found');
            }

            const host = await this.userService.getUserMe(
                property.host_id.toString(),
            );
            if (!host) {
                Logger.error('Host not found', methodContext, {
                    hostId: property.host_id,
                });
                throw new Error('User host not found');
            }

            await this.service.likeProperty(userId, id);
            Logger.info('Successfully liked property', methodContext, {
                userId,
                propertyId: id,
            });

            res.status(200).json({
                result: true,
            });

            // Send Push notification for the host
            if (host.user_devices && host.user_devices.length > 0) {
                const hostTokens = host.user_devices.map(
                    (device) => device.firebase_token,
                ) as string[];

                Logger.info('Sending notification to host', methodContext, {
                    hostId: host.id,
                    deviceCount: hostTokens.length,
                });

                const hostPayload = {
                    title: 'New like on your property',
                    body: `${user.first_name} liked your property`,
                    data: {
                        navigate_to: '/notification',
                    },
                } as NotificationPayload;

                await this.notificationService.sendToUser(
                    hostTokens,
                    hostPayload,
                );

                Logger.info('Notification sent to host', methodContext, {
                    hostId: host.id,
                });
            }

            // Send Push notification for the user
            if (user.user_devices && user.user_devices.length > 0) {
                const userTokens = user.user_devices.map(
                    (device) => device.firebase_token,
                ) as string[];

                Logger.info('Sending notification to user', methodContext, {
                    userId: user.id,
                    deviceCount: userTokens.length,
                });

                const userPayload = {
                    title: 'New request on a property',
                    body: `${host.first_name} will review your request`,
                    data: {
                        navigate_to: '/notification',
                    },
                } as NotificationPayload;

                await this.notificationService.sendToUser(
                    userTokens,
                    userPayload,
                );

                Logger.info('Notification sent to user', methodContext, {
                    userId: user.id,
                });
            }
        } catch (e: any) {
            Logger.error(e.message || 'Error on likeProperty', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error on likeProperty',
            });
        }
    };

    public withdrawPropertyRequest = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - withdrawPropertyRequest';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            const { id } = req.params;
            Logger.info('Withdrawing property request', methodContext, {
                userId,
                propertyId: id,
            });

            const result = await this.service.findPropertyById(id);

            if (!result) {
                Logger.error('Property not found', methodContext, {
                    propertyId: id,
                });
                throw new Error('Property not found');
            }

            await this.service.withdrawPropertyRequest(userId, id);
            Logger.info('Successfully withdrawn request', methodContext, {
                userId,
                propertyId: id,
            });

            res.status(200).json({
                result: true,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error on withdrawPropertyRequest',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error on withdrawPropertyRequest',
            });
        }
    };

    public getPropertiesByStatus = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getPropertiesByStatus';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            const { status } = req.query;
            Logger.info('Fetching properties by status', methodContext, {
                userId,
                status,
            });

            let statusInput;

            if (
                status &&
                typeof status === 'string' &&
                ['pending', 'approved'].includes(status)
            ) {
                statusInput = status;
            }

            const properties = await this.service.getPropertiesByStatus(
                userId,
                statusInput,
            );

            Logger.info('Found properties', methodContext, {
                count: properties.length,
                status: statusInput || 'all',
            });

            res.status(200).json({
                total: properties.length,
                properties: properties,
            });
        } catch (e: any) {
            Logger.error(
                e?.message || 'Error on getPropertiesByStatus',
                methodContext,
            );
            res.status(400).json({
                message: e?.message ?? 'Error on getPropertiesByStatus',
            });
        }
    };

    public getHostProperties = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getHostProperties';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            const { status } = req.query;
            Logger.info('Fetching host properties', methodContext, {
                userId,
                status,
            });

            const properties = await this.service.getHostProperties(userId);

            Logger.info('Found host properties', methodContext, {
                count: properties.length,
            });

            res.status(200).json({
                total: properties.length,
                properties: properties,
            });
        } catch (e: any) {
            Logger.error(
                e?.message || 'Error on getHostProperties',
                methodContext,
            );
            res.status(400).json({
                message: e?.message ?? 'Error on getHostProperties',
            });
        }
    };

    public deleteProperty = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - deleteProperty';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            const { id } = req.params;
            Logger.info('Deleting property', methodContext, {
                userId,
                propertyId: id,
            });

            const result = await this.service.findPropertyById(id);

            if (!result) {
                Logger.error('Property not found', methodContext, {
                    propertyId: id,
                });
                throw new Error('Property not found');
            }

            // Check if the user is the host of the property
            if (result.host_id !== userId) {
                Logger.error(
                    'User is not the host of the property',
                    methodContext,
                    {
                        userId,
                        propertyId: id,
                    },
                );
                throw new Error('User is not the host of the property');
            }

            await this.service.deleteProperty(id);
            Logger.info('Successfully deleted property', methodContext, {
                userId,
                propertyId: id,
            });

            res.status(200).json({
                result: true,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error on deleteProperty', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error on deleteProperty',
            });
        }
    };

    public update = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - update';
        try {
            const propertyId = req.params.id;
            Logger.info(
                `Starting property update with ${req.files?.length || 0} files`,
                methodContext,
                { propertyId },
            );

            const userId = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId });

            const user = await this.userService.getUserMe(userId);
            if (!user) {
                Logger.error('User not found', methodContext, { userId });
                throw new Error('User not found');
            }

            const input = {
                ...(req.body.data ? JSON.parse(req.body.data) : req.body),
            } as Partial<IPropertyUpdateInput>;

            // Check if the property exists
            const existingProperty =
                await this.service.findPropertyById(propertyId);
            if (!existingProperty) {
                Logger.error('Property not found', methodContext, {
                    propertyId,
                });
                throw new Error('Property not found');
            }
            // Check if the user is the host of the property
            if (existingProperty.host_id !== userId) {
                Logger.error(
                    'User is not the host of the property',
                    methodContext,
                    { userId, propertyId },
                );
                throw new Error('User is not the host of the property');
            }

            // Handle geolocation update if address or city changed
            if (input.location_item?.city_id || input.address) {
                const cityId = input.location_item?.city_id;
                let cityFound;

                if (cityId) {
                    // User is changing the city - use the new city
                    cityFound =
                        await this.locationService.getLocationById(cityId);
                } else {
                    // User is only changing the address, not the city
                    // We need to get the current city to properly geocode the new address
                    cityFound = await this.locationService.getLocationById(
                        existingProperty!.city_id,
                    );
                }

                if (input.address) {
                    const addressToLookFor = `${input.address} ${cityFound?.city_name}, ${cityFound?.state_name ?? ''}, ${cityFound?.country_name}`;
                    Logger.info('Processing address', methodContext, {
                        address: addressToLookFor,
                    });

                    // Gecolocation from address (latitude and longitude)
                    const geo =
                        await getCoordinatesFromAddress(addressToLookFor);
                    Logger.info('Geocoding result', methodContext, {
                        latitude: geo.latitude,
                        longitude: geo.longitude,
                    });

                    input.latitude = geo.latitude;
                    input.longitude = geo.longitude;
                }
            }

            const inputForLogging = { ...input };
            delete inputForLogging.photos;
            Logger.info(
                'Updating property with data',
                methodContext,
                inputForLogging,
            );

            await this.service.updateProperty(
                propertyId,
                input as IPropertyUpdateInput,
                user.id,
            );
            Logger.info('Property updated', methodContext, { propertyId });

            // Handle photo updates if new photos are provided
            if (req.files || req.body.photos) {
                // const fileData = checkForFilesAndReturn(
                //     req.files ?? req.body.photos,
                // );
                // Logger.info('Processing new files', methodContext, {
                //     fileCount: fileData.length,
                // });

                // Get existing photo count to continue numbering
                // const existingPhotos =
                //     await this.service.getPropertyPhotos(propertyId);
                // let indexImage = existingPhotos.length;

                // const photosUrl: string[] = [];

                // for (const file of fileData) {
                //     const filePath = `properties/${propertyId}`;
                //     const fileName = `${indexImage + 1}.${file.type}`;
                //     Logger.info('Uploading image', methodContext, {
                //         imageIndex: indexImage + 1,
                //         filePath,
                //         fileName,
                //     });

                //     const url = await uploadPhotoToMinio(
                //         file.buffer,
                //         filePath,
                //         fileName,
                //     );
                //     Logger.info('Image uploaded successfully', methodContext, {
                //         url,
                //     });

                //     indexImage++;
                //     photosUrl.push(url);
                // }

                // if (photosUrl.length > 0) {
                //     Logger.info('Adding new property photos', methodContext, {
                //         photoCount: photosUrl.length,
                //     });
                //     await this.service.savePropertyPhotos(
                //         propertyId,
                //         photosUrl,
                //     );
                // }
            }

            Logger.info('Property updated successfully', methodContext);
            res.status(200).json({
                message: 'Property updated successfully',
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error updating property', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error updating property',
            });
        }
    };
}

export default PropertyController;
