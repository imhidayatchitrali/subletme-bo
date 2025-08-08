import { Request, Response } from 'express';
import UserService from '../services/user.service';
import { IUserUpdateInput } from '../models/user.model';
import {
    checkForFileAndReturn,
    checkForFilesAndReturn,
    uploadPhotoToMinio,
} from '../helpers/minio.helper';
import {
    DeviceMetadata,
    NotificationPayload,
} from '../models/notification.model';
import Logger from '../utils/logger';
import { parseCityIds, parseNumericParam } from '../helpers/property.helper';
import NotificationService from '../services/notification.service';
import { getAddressFromCoordinates } from '../helpers/location.helper';
import { getProfileProgress } from '../helpers/user.helper';

class UserController {
    private userService: UserService;
    private notificationService: NotificationService;
    private context: string;

    constructor() {
        this.context = 'UserController';
        this.userService = new UserService();
        this.notificationService = new NotificationService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public getUser = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getUser';
        try {
            Logger.info('Fetching user', methodContext);

            // Get token from headers
            const id = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId: id });

            const userResponse = await this.userService.getUserMe(id);
            if (!userResponse) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            Logger.info('Successfully retrieved user', methodContext, {
                userId: id,
            });

            const progress = getProfileProgress(userResponse);
            res.status(200).json({
                ...userResponse,
                profile_progress: progress,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error fetching user', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error fetching user',
            });
        }
    };

    public updateUser = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - updateUser';
        try {
            Logger.info('Starting user update', methodContext);

            const id = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId: id });

            let input = req.body as IUserUpdateInput;

            // Create a copy for logging without photo data
            const inputForLogging = { ...input };
            delete inputForLogging.photo_url;
            Logger.info('Update data', methodContext, inputForLogging);

            const fileData = checkForFileAndReturn(req.body.photo_url);
            delete input.photo_url;

            if (fileData) {
                Logger.info('Processing profile photo', methodContext);

                const filePath = `users/${id}`;
                const fileName = `profile.${fileData.type}`;
                Logger.info('Uploading to path', methodContext, {
                    filePath,
                    fileName,
                });

                const url = await uploadPhotoToMinio(
                    fileData.buffer,
                    filePath,
                    fileName,
                );
                Logger.info('Photo uploaded successfully', methodContext, {
                    url,
                });

                input = {
                    ...input,
                    photo_url: url,
                };
            }

            Logger.info('Getting address from coordinates', methodContext, {
                latitude: input.latitude,
                longitude: input.longitude,
            });

            const addressInfo = await getAddressFromCoordinates(
                input.latitude,
                input.longitude,
            );

            if (addressInfo) {
                Logger.info(
                    'Address retrieved successfully',
                    methodContext,
                    addressInfo,
                );
                input.address = JSON.stringify(addressInfo);
            } else {
                Logger.info('No address found for coordinates', methodContext);
            }

            Logger.info('Updating user in database', methodContext);
            const user = await this.userService.updateUser(id, input);
            if (!user) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            Logger.info('User updated successfully', methodContext, {
                userId: id,
            });
            res.status(200).json({
                message: 'User updated',
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error updating user', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error updating user',
            });
        }
    };

    public updateLanguage = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - updateLanguage';
        try {
            Logger.info('Starting language update', methodContext, {
                language: req.body.language,
            });

            const id = (req as any).token.userId;
            const language = req.body.language;
            Logger.info('User details', methodContext, {
                userId: id,
                language,
            });

            const user = await this.userService.updateUserLanguage(
                id,
                language,
            );
            if (!user) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            Logger.info('Language updated successfully', methodContext, {
                userId: id,
            });
            res.status(200).json({ message: 'Language updated' });
        } catch (e: any) {
            Logger.error(e.message || 'Error updating language', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error updating language',
            });
        }
    };

    public updateDeviceInfo = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - updateDeviceInfo';
        try {
            Logger.info('Starting', methodContext, req.body);

            const id = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId: id });

            const firebaseToken = req.body.firebase_token;
            const metadata = { ...req.body };
            delete metadata.firebase_token;

            // Create a safe version for logging
            const metadataForLogging = { ...metadata };
            Logger.info('Device metadata', methodContext, metadataForLogging);

            // Validate required fields
            if (!firebaseToken) {
                Logger.error('Missing firebase token', methodContext, {
                    userId: id,
                });
                return res.status(400).json({
                    success: false,
                    message: 'Firebase token are required',
                });
            }

            Logger.info('Updating device info in database', methodContext);
            await this.userService.updateDeviceInfo(
                id,
                firebaseToken as string,
                metadata as DeviceMetadata,
            );

            Logger.info('Device info updated successfully', methodContext, {
                userId: id,
            });
            res.status(200).json({ message: 'Device info updated' });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error updating device info',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error updating device info',
            });
        }
    };

    public getUsersNearMe = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getUsersNearMe';
        try {
            Logger.info('Starting', methodContext, req.query);

            const id = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId: id });

            const radius = parseNumericParam(
                req.query.radius as string | undefined,
            );

            const city_ids = parseCityIds(
                req.query.city_ids as string | undefined,
            );

            const filters = {
                city_ids,
                radius,
            };

            Logger.info('Finding users near user with filters', methodContext, {
                filters,
                userId: id,
            });

            const results = await this.userService.getUsersNearMe(id, filters);
            Logger.info('Found users', methodContext, {
                userId: id,
                count: results.users.length,
            });

            res.status(200).json({
                total: results.users.length,
                results: results.users,
                code: results.code,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error finding nearby users',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error updating device info',
            });
        }
    };

    public getUsersSwipes = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getUsersSwipes';
        try {
            Logger.info('Starting', methodContext, req.query);

            const id = (req as any).token.userId; // host_id
            Logger.info('User ID', methodContext, { userId: id });

            const { status } = req.query;
            Logger.info('Status filter', methodContext, {
                status: status || 'all',
            });

            let statusInput;

            if (
                status &&
                typeof status === 'string' &&
                ['pending', 'approved'].includes(status)
            ) {
                statusInput = status;
            }

            Logger.info('Getting swipes for user', methodContext, {
                userId: id,
                status: statusInput || 'all',
            });

            const results = await this.userService.getUserSwipes(
                id,
                statusInput,
            );
            Logger.info('Found swipes', methodContext, {
                userId: id,
                count: results.length,
            });

            res.status(200).json({
                total: results.length,
                results: results,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error getting user swipes',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error getting getUsersSwipes',
            });
        }
    };

    public unlikeUserSublet = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - unlikeUserSublet';
        try {
            Logger.info('Starting', methodContext, req.params);

            const userId = (req as any).token.userId;
            const { id } = req.params;
            Logger.info('Unlike user request', methodContext, {
                userId,
                targetId: id,
            });

            // Check if user is different from the one in the token
            if (userId === id) {
                Logger.error(
                    'User attempting to unlike themselves',
                    methodContext,
                    { userId },
                );
                throw new Error('You cannot unlike yourself');
            }

            const result = await this.userService.getUserMe(id);

            if (!result) {
                Logger.error('Target user not found', methodContext, {
                    targetId: id,
                });
                throw new Error('User not found');
            }

            Logger.info('Processing unlike request', methodContext);
            await this.userService.unlikeUserSublet(userId, id);
            Logger.info('Successfully unliked user', methodContext, {
                userId,
                targetId: id,
            });

            res.status(200).json({
                result: true,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error on unlikeUserSublet',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error on unlikeUserSublet',
            });
        }
    };

    public likeUserSublet = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - likeUserSublet';
        try {
            Logger.info('Starting', methodContext, req.params);

            const userId = (req as any).token.userId;
            const { id } = req.params;
            Logger.info('Like user request', methodContext, {
                userId,
                targetId: id,
            });

            // Check if user is different from the one in the token
            if (userId === id) {
                Logger.error(
                    'User attempting to like themselves',
                    methodContext,
                    { userId },
                );
                throw new Error('You cannot unlike yourself');
            }

            const userSublet = await this.userService.getUserMe(id);

            if (!userSublet) {
                Logger.error('Target user not found', methodContext, {
                    targetId: id,
                });
                throw new Error('User sublet not found');
            }

            Logger.info('Processing like request', methodContext);
            await this.userService.likeUserSublet(userId, id);
            Logger.info('Successfully liked user', methodContext, {
                userId,
                targetId: id,
            });

            res.status(200).json({
                result: true,
            });

            Logger.info('Getting host user details', methodContext);
            const host = await this.userService.getUserMe(userId);
            if (!host) {
                Logger.error('Host user not found', methodContext, {
                    hostId: userId,
                });
                throw new Error('User host not found');
            }

            // Send Push notification for the user sublet
            if (userSublet.user_devices && userSublet.user_devices.length > 0) {
                const userSubletTokens = userSublet.user_devices.map(
                    (device) => device.firebase_token,
                ) as string[];

                Logger.info(
                    'Sending notification to target user',
                    methodContext,
                    {
                        targetId: id,
                        deviceCount: userSubletTokens.length,
                    },
                );

                const hostPayload = {
                    title: 'New like on your profile',
                    body: `${host.first_name} liked your profile`,
                    data: {
                        navigate_to: '/notification',
                    },
                } as NotificationPayload;

                await this.notificationService.sendToUser(
                    userSubletTokens,
                    hostPayload,
                );

                Logger.info('Notification sent to target user', methodContext, {
                    targetId: id,
                });
            } else {
                Logger.info(
                    'No devices found for target user, notification not sent',
                    methodContext,
                    { targetId: id },
                );
            }

            // Send Push notification for the host
            if (host.user_devices && host.user_devices.length > 0) {
                const hostTokens = host.user_devices.map(
                    (device) => device.firebase_token,
                ) as string[];

                Logger.info('Sending notification to host', methodContext, {
                    hostId: userId,
                    deviceCount: hostTokens.length,
                });

                const userPayload = {
                    title: 'New request on a sublet profile',
                    body: `${userSublet.first_name} will review your request`,
                    data: {
                        navigate_to: '/notification',
                    },
                } as NotificationPayload;

                await this.notificationService.sendToUser(
                    hostTokens,
                    userPayload,
                );

                Logger.info('Notification sent to host', methodContext, {
                    hostId: userId,
                });
            } else {
                Logger.info(
                    'No devices found for host, notification not sent',
                    methodContext,
                    { hostId: userId },
                );
            }
        } catch (e: any) {
            Logger.error(e.message || 'Error on likeUserSublet', methodContext);
            res.status(400).json({
                message: e.message ?? 'Error on likeUserSublet',
            });
        }
    };

    public rejectUserRequest = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - rejectUserRequest';
        try {
            Logger.info('Starting', methodContext, req.params);

            const hostId = (req as any).token.userId; // Current user (host) ID from token
            const { id } = req.params; // User ID whose request is being rejected
            Logger.info('Reject user request', methodContext, {
                hostId,
                userId: id,
            });

            // Check if user is different from the one in the token
            if (hostId === id) {
                Logger.error(
                    'Host attempting to reject their own request',
                    methodContext,
                    { hostId },
                );
                throw new Error('You cannot reject your own request');
            }

            const user = await this.userService.getUserMe(id);

            if (!user) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            // Call service method to reject the user request
            Logger.info('Processing rejection request', methodContext);
            await this.userService.rejectUserRequest(hostId, id);
            Logger.info('Successfully rejected request', methodContext, {
                hostId,
                userId: id,
            });

            res.status(200).json({
                result: true,
            });

            // Send push notification to the rejected user
            Logger.info('Getting host user details', methodContext);
            const host = await this.userService.getUserMe(hostId);
            if (!host) {
                Logger.error('Host user not found', methodContext, { hostId });
                throw new Error('Host user not found');
            }

            // Send Push notification for the rejected user
            if (user.user_devices && user.user_devices.length > 0) {
                const userTokens = user.user_devices.map(
                    (device) => device.firebase_token,
                ) as string[];

                Logger.info('Sending notification to user', methodContext, {
                    userId: id,
                    deviceCount: userTokens.length,
                });

                const userPayload = {
                    title: 'Request update',
                    body: `${host.first_name} has declined your request`,
                    data: {
                        navigate_to: '/notification',
                    },
                } as NotificationPayload;

                await this.notificationService.sendToUser(
                    userTokens,
                    userPayload,
                );

                Logger.info('Notification sent to user', methodContext, {
                    userId: id,
                });
            } else {
                Logger.info(
                    'No devices found for user, notification not sent',
                    methodContext,
                    { userId: id },
                );
            }
        } catch (e: any) {
            Logger.error(
                e.message || 'Error on rejectUserRequest',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error on rejectUserRequest',
            });
        }
    };

    public approveUserRequest = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - approveUserRequest';
        try {
            Logger.info('Starting', methodContext, req.params);

            const hostId = (req as any).token.userId; // Current user (host) ID from token
            const { id, propertyId } = req.params;
            Logger.info('Approve user request', methodContext, {
                hostId,
                userId: id,
                propertyId,
            });

            // Check if user is different from the one in the token
            if (hostId === id) {
                Logger.error(
                    'Host attempting to approve their own request',
                    methodContext,
                    { hostId },
                );
                throw new Error('You cannot approve your own request');
            }

            const user = await this.userService.getUserMe(id);

            if (!user) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            // Call service method to approve the user request
            Logger.info('Processing approval request', methodContext);
            const requestId = await this.userService.approveUserRequest(
                id,
                propertyId,
            );
            Logger.info('Successfully approved request', methodContext, {
                userId: id,
                propertyId,
                requestId,
            });

            Logger.info('Getting request details', methodContext, {
                requestId,
            });
            const result = await this.userService.getUserRequest(requestId);
            Logger.info(
                'Request details retrieved successfully',
                methodContext,
            );

            res.status(200).json({
                result: result,
            });

            // Send push notification to the approved user
            Logger.info('Getting host user details', methodContext);
            const host = await this.userService.getUserMe(hostId);
            if (!host) {
                Logger.error('Host user not found', methodContext, { hostId });
                throw new Error('Host user not found');
            }

            // Send Push notification for the approved user
            if (user.user_devices && user.user_devices.length > 0) {
                const userTokens = user.user_devices.map(
                    (device) => device.firebase_token,
                ) as string[];

                Logger.info('Sending notification to user', methodContext, {
                    userId: id,
                    deviceCount: userTokens.length,
                });

                const userPayload = {
                    title: 'Request approved',
                    body: `${host.first_name} has approved your request`,
                    data: {
                        navigate_to: '/notification',
                    },
                } as NotificationPayload;

                await this.notificationService.sendToUser(
                    userTokens,
                    userPayload,
                );

                Logger.info('Notification sent to user', methodContext, {
                    userId: id,
                });
            } else {
                Logger.info(
                    'No devices found for user, notification not sent',
                    methodContext,
                    { userId: id },
                );
            }
        } catch (e: any) {
            Logger.error(
                e.message || 'Error on approveUserRequest',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error on approveUserRequest',
            });
        }
    };

    public updateUserPhotos = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - updateUserPhotos';
        try {
            Logger.info('Starting', methodContext, req.body);

            const userId = (req as any).token.userId;
            Logger.info('Processing photos for user', methodContext, {
                userId,
            });

            const files = req.files as Express.Multer.File[];

            if (!files || files.length === 0) {
                Logger.error('No images provided - skipping', methodContext, {
                    userId,
                });
                return res.status(200).json({
                    message: 'No images provided',
                });
            }

            // Extract display orders from request body
            const displayOrders: number[] = [];

            for (const key in req.body) {
                if (key.startsWith('displayOrder_')) {
                    const parsedOrder = parseInt(req.body[key]);
                    if (!isNaN(parsedOrder)) {
                        displayOrders.push(parsedOrder);
                    }
                }
            }

            Logger.info('Display orders to update', methodContext, {
                displayOrders,
            });

            // Ensure we have the same number of orders as files
            if (displayOrders.length !== files.length) {
                Logger.error(
                    'Mismatch between number of files and display orders',
                    methodContext,
                    {
                        fileCount: files.length,
                        orderCount: displayOrders.length,
                    },
                );
                return res.status(400).json({
                    message:
                        'Mismatch between number of files and display orders',
                });
            }

            const fileData = checkForFilesAndReturn(files);
            if (!fileData || fileData.length === 0) {
                Logger.error('No valid files provided', methodContext);
                throw new Error('No valid files provided');
            }

            const filePath = `users/${userId}`;
            const updatedPhotos = [];

            // Process each file with its corresponding display order
            for (let i = 0; i < fileData.length; i++) {
                const file = fileData[i];
                const displayOrder = displayOrders[i];
                const fileName = `photo_${Date.now()}_${i}.${file.type}`;

                Logger.info('Uploading to path', methodContext, {
                    filePath,
                    fileName,
                    displayOrder,
                });

                // Upload to Minio
                const url = await uploadPhotoToMinio(
                    file.buffer,
                    filePath,
                    fileName,
                );

                // Check if a photo with this display order already exists
                const existingPhoto =
                    await this.userService.getPhotoByDisplayOrder(
                        userId,
                        displayOrder,
                    );

                let photoId: number;
                let isProfile = false;

                if (existingPhoto) {
                    // Update the existing photo at this display order
                    photoId = existingPhoto.id;
                    isProfile = existingPhoto.is_profile; // Preserve profile status

                    await this.userService.updatePhotoUrl(photoId, url);

                    Logger.info('Updated existing photo', methodContext, {
                        photoId,
                        displayOrder,
                        isProfile,
                    });
                } else {
                    // Create a new photo at this display order
                    photoId = await this.userService.saveUserPhotoAtPosition(
                        userId,
                        url,
                        displayOrder === 1,
                        displayOrder,
                    );

                    Logger.info('Created new photo', methodContext, {
                        photoId,
                        displayOrder,
                    });
                }

                updatedPhotos.push({
                    id: photoId,
                    url: url,
                    isProfile: isProfile,
                    displayOrder: displayOrder,
                });
            }

            Logger.info('User photos updated successfully', methodContext, {
                userId,
                updatedCount: updatedPhotos.length,
            });

            res.status(200).json({
                message: 'User photos updated',
                photos: updatedPhotos,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error updating user photos',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error updating user photos',
            });
        }
    };

    public getUserSubletDetails = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getUserSubletDetails';
        try {
            Logger.info('Starting', methodContext, req.params);

            const userId = (req as any).token.userId;
            const { id } = req.params; // User ID to fetch sublet details
            Logger.info('Fetching sublet details for user', methodContext, {
                userId,
                targetId: id,
            });

            // Check if user is different from the one in the token
            if (userId === id) {
                Logger.error(
                    'User attempting to fetch their own sublet details',
                    methodContext,
                    { userId },
                );
                throw new Error('You cannot fetch your own sublet details');
            }

            const userSublet = await this.userService.getUserSubletDetails(id);
            if (!userSublet) {
                Logger.error('User not found', methodContext, { userId: id });
                throw new Error('User not found');
            }

            res.status(200).json({
                result: userSublet,
            });
        } catch (e: any) {
            Logger.error(
                e.message || 'Error fetching user sublet details',
                methodContext,
            );
            res.status(400).json({
                message: e.message ?? 'Error fetching user sublet details',
            });
        }
    };
}

export default UserController;
