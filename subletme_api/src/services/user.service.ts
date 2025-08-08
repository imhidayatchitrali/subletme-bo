import { Client } from '../database';
import { DeviceMetadata } from '../models/notification.model';
import {
    IUser,
    IUserInput,
    IUserPhoto,
    IUserProfile,
    IUserRequest,
    IUserUpdateInput,
} from '../models/user.model';
import Logger from '../utils/logger';

class UserService {
    private client: Client;
    private context: string;

    constructor() {
        this.context = 'UserService';
        this.client = new Client();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public async findOrCreateUser(user: IUserInput): Promise<IUser> {
        const methodContext = this.context + ' - findOrCreateUser';
        try {
            Logger.info('Starting', methodContext, {
                email: user.email,
            });
            await this.client.beginTransaction();

            // First try to find user by social ID
            let existingUser = null;
            if (user.google_id) {
                Logger.info('Searching by Google ID', methodContext);
                existingUser = await this.client.query(
                    'SELECT * FROM users WHERE google_id = $1',
                    [user.google_id],
                );
            } else if (user.apple_id) {
                Logger.info('Searching by Apple ID', methodContext);
                existingUser = await this.client.query(
                    'SELECT * FROM users WHERE apple_id = $1',
                    [user.apple_id],
                );
            }

            // If not found by social ID, try email
            if (!existingUser?.rows.length) {
                Logger.info('Searching by email', methodContext, {
                    email: user.email,
                });
                existingUser = await this.client.query(
                    'SELECT * FROM users WHERE email = $1',
                    [user.email],
                );
            }

            if (existingUser?.rows.length) {
                Logger.info('User found, updating', methodContext, {
                    id: existingUser.rows[0].id,
                });
                // Update existing user
                const updateFields = [];
                const values = [];
                let valueIndex = 1;

                if (user.google_id && !existingUser.rows[0].google_id) {
                    updateFields.push(`google_id = $${valueIndex}`);
                    values.push(user.google_id);
                    valueIndex++;
                }
                if (user.apple_id && !existingUser.rows[0].apple_id) {
                    updateFields.push(`apple_id = $${valueIndex}`);
                    values.push(user.apple_id);
                    valueIndex++;
                }
                if (user.refresh_token) {
                    updateFields.push(`refresh_token = $${valueIndex}`);
                    values.push(user.refresh_token);
                    valueIndex++;
                }
                updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

                if (updateFields.length > 0) {
                    Logger.info('Updating user fields', methodContext, {
                        fields: updateFields.length,
                    });
                    existingUser = await this.client.query(
                        `UPDATE users 
                         SET ${updateFields.join(', ')}
                         WHERE id = $${valueIndex}
                         RETURNING *`,
                        [...values, existingUser.rows[0].id],
                    );
                }
                await this.client.query('COMMIT');
                Logger.info('User updated successfully', methodContext, {
                    id: existingUser.rows[0].id,
                });
                return existingUser.rows[0] as IUser;
            }

            // Create new user
            Logger.info('Creating new user', methodContext, {
                email: user.email,
            });
            const insertResult = await this.client.query(
                `INSERT INTO users (
                        email, 
                        photo_url, 
                        google_id, 
                        first_name, 
                        last_name, 
                        apple_id,
                        platform,
                        refresh_token,
                        onboarding_step
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *`,
                [
                    user.email,
                    user.photo_url,
                    user.google_id,
                    user.first_name,
                    user.last_name,
                    user.apple_id,
                    user.platform,
                    user.refresh_token,
                    user.onboarding_step,
                ],
            );

            await this.client.query('COMMIT');
            Logger.info('User created successfully', methodContext, {
                id: insertResult.rows[0].id,
            });
            return insertResult.rows[0] as IUser;
        } catch (error: any) {
            await this.client.rollback();
            Logger.error('Error', methodContext, {
                message: error.message,
            });
            throw error;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    public async getUserMe(userId: string): Promise<IUser | null> {
        const methodContext = this.context + ' - getUserMe';
        try {
            Logger.info('Starting', methodContext, {
                userId,
            });

            // First query to get user data
            const userResult = await this.client.query(
                `SELECT 
                    u.*,
                    uft.firebase_token,
                    uft.device_metadata
                 FROM users u
                    LEFT JOIN user_firebase_tokens uft ON u.id = uft.user_id
                    WHERE u.id = $1`,
                [userId],
            );

            if (userResult.rows.length === 0) {
                Logger.info('User not found', methodContext, {
                    userId,
                });
                return null;
            }

            // Check if user has at least 1 property
            const propertyCountResult = await this.client.query(
                `SELECT COUNT(*) as property_count
                 FROM properties
                 WHERE host_id = $1`,
                [userId],
            );
            const propertyCount = parseInt(
                propertyCountResult.rows[0].property_count,
            );

            // Second query to get all photos for the user
            const photosResult = await this.client.query(
                `SELECT 
                    id,
                    photo_url,
                    is_profile,
                    display_order
                 FROM user_photos
                 WHERE user_id = $1
                 ORDER BY display_order ASC`,
                [userId],
            );

            // Process photos
            const photos = photosResult.rows.map((row) => ({
                id: row.id,
                url: row.photo_url,
                is_profile: row.is_profile,
                display_order: row.display_order,
            }));

            // Find profile photo URL for backward compatibility
            let profilePhotoUrl = userResult.rows[0].photo_url; // Default to old schema

            // Use the first profile photo from user_photos if available
            const profilePhoto = photos.find((photo) => photo.is_profile);
            if (profilePhoto) {
                profilePhotoUrl = profilePhoto.url;
            }
            // If no profile photo but we have photos, use the first one
            else if (photos.length > 0) {
                profilePhotoUrl = photos[0].url;
            }

            const user: IUser = {
                id: userResult.rows[0].id,
                email: userResult.rows[0].email,
                first_name: userResult.rows[0].first_name,
                last_name: userResult.rows[0].last_name,
                date_of_birth: userResult.rows[0].date_of_birth,
                onboarding_step: userResult.rows[0].onboarding_step,
                instagram_username: userResult.rows[0].instagram_username,
                facebook_username: userResult.rows[0].facebook_username,
                language: userResult.rows[0].language,
                photo_url: profilePhotoUrl, // Keep for backward compatibility
                photos: photos, // Add all photos
                gender: userResult.rows[0].gender,
                user_devices: [],
                longitude: userResult.rows[0].longitude,
                latitude: userResult.rows[0].latitude,
                is_host: propertyCount > 0,
                address: userResult.rows[0].address
                    ? {
                          city: userResult.rows[0].address.city,
                          country: userResult.rows[0].address.country,
                          formatted_address:
                              userResult.rows[0].address.formatted_address,
                      }
                    : undefined,
            };

            let deviceCount = 0;
            userResult.rows.forEach((row) => {
                if (row.firebase_token) {
                    user.user_devices!.push({
                        firebase_token: row.firebase_token,
                        device_metadata: row.device_metadata as DeviceMetadata,
                    });
                    deviceCount++;
                }
            });

            Logger.info('User found', methodContext, {
                userId,
                deviceCount,
                photoCount: photos.length,
            });
            return user;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                message: error.message,
            });
            throw new Error('Failed to fetch user');
        }
    }

    public async findUserByEmail(email: string): Promise<IUser | null> {
        const methodContext = this.context + ' - findUserByEmail';
        try {
            Logger.info('Starting', methodContext, {
                email,
            });
            const result = await this.client.query(
                `SELECT *
                     FROM users 
                     WHERE LOWER(email) = LOWER($1)`,
                [email],
            );

            if (result.rows.length === 0) {
                Logger.info('User not found', methodContext, { email });
                return null;
            }

            Logger.info('User found', methodContext, {
                email,
                id: result.rows[0].id,
            });
            return result.rows[0] as IUser;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                email,
                message: error.message,
            });
            throw new Error('Failed to fetch user');
        }
    }

    public async saveUserPhoto(
        userId: string,
        photoUrl: string,
        isProfile: boolean = false,
    ): Promise<number> {
        const methodContext = this.context + ' - saveUserPhoto';
        try {
            Logger.info('Starting to save photo URL', methodContext, {
                userId,
                photoUrl,
            });

            // Get the highest display_order for this user to determine the next order
            const orderResult = await this.client.query(
                `SELECT COALESCE(MAX(display_order), 0) as max_order 
                 FROM user_photos 
                 WHERE user_id = $1`,
                [userId],
            );
            const nextDisplayOrder =
                parseInt(orderResult.rows[0].max_order) + 1;

            // If this is set as a profile photo and we're using the trigger approach,
            // we just insert with is_profile=true and the trigger handles the rest
            const insertResult = await this.client.query(
                `INSERT INTO user_photos(user_id, photo_url, is_profile, display_order)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [userId, photoUrl, isProfile, nextDisplayOrder],
            );

            const photoId = insertResult.rows[0].id;

            Logger.info('Photo URL saved successfully', methodContext, {
                userId,
                photoId,
                isProfile,
            });

            return photoId;
        } catch (error: any) {
            Logger.error('Error saving photo URL', methodContext, {
                userId,
                message: error.message,
            });
            throw new Error('Failed to save photo URL');
        }
    }

    public async updateUser(
        id: string,
        input: IUserUpdateInput,
    ): Promise<IUser | null> {
        const methodContext = this.context + ' - IUser';
        try {
            Logger.info('Starting', methodContext, id);
            const updateFields = [];
            const values = [];
            let valueIndex = 1;

            // Create a log-safe version of the input
            const inputLogSafe = { ...input };
            if (inputLogSafe.photo_url) inputLogSafe.photo_url = '[PHOTO_URL]';
            Logger.info('Update fields', methodContext, {
                input: inputLogSafe,
            });

            if (input.first_name) {
                updateFields.push(`first_name = $${valueIndex}`);
                values.push(input.first_name);
                valueIndex++;
            }
            if (input.last_name) {
                updateFields.push(`last_name = $${valueIndex}`);
                values.push(input.last_name);
                valueIndex++;
            }
            if (input.photo_url) {
                updateFields.push(`photo_url = $${valueIndex}`);
                values.push(input.photo_url);
                valueIndex++;
            }
            if (input.gender) {
                updateFields.push(`gender = $${valueIndex}`);
                values.push(input.gender);
                valueIndex++;
            }

            if (input.address) {
                updateFields.push(`address = $${valueIndex}::jsonb`);
                values.push(input.address);
                valueIndex++;
            }

            if (input.instagram) {
                updateFields.push(`instagram_username = $${valueIndex}`);
                values.push(input.instagram);
                valueIndex++;
            }
            if (input.facebook) {
                updateFields.push(`facebook_username = $${valueIndex}`);
                values.push(input.facebook);
                valueIndex++;
            }

            if (input.longitude && input.latitude) {
                // Set the location as a geography POINT
                updateFields.push(
                    `location = ST_SetSRID(ST_MakePoint($${valueIndex}, $${valueIndex + 1}), 4326)::geography`,
                );
                values.push(input.longitude);
                valueIndex++;
                values.push(input.latitude);
                valueIndex++;

                // Update the location_updated_at timestamp
                updateFields.push(`location_updated_at = CURRENT_TIMESTAMP`);
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

            Logger.info('Executing update', methodContext, {
                fieldCount: updateFields.length,
            });
            const result = await this.client.query(
                `UPDATE users
                     SET ${updateFields.join(', ')}
                     WHERE id = $${valueIndex}
                     RETURNING *`,
                [...values, id],
            );

            if (result.rows.length === 0) {
                Logger.error('User not found', methodContext, {
                    id,
                });
                return null;
            }

            Logger.info('User updated successfully', methodContext, { id });
            return result.rows[0] as IUser;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                id,
                message: error.message,
            });
            throw new Error('Failed to update user');
        }
    }

    public async updateUserPassword(
        userId: string,
        password: string,
    ): Promise<void> {
        const methodContext = this.context + ' - void';
        try {
            Logger.info('Starting', methodContext, {
                userId,
            });
            await this.client.query(
                `UPDATE users
                     SET hash_password = $1
                     WHERE id = $2`,
                [password, userId],
            );
            Logger.info('Password updated successfully', methodContext, {
                userId,
            });
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                message: error.message,
            });
            throw new Error('Failed to update user password');
        }
    }

    public async updateUserLanguage(
        userId: string,
        language: string,
    ): Promise<IUser | null> {
        const methodContext = this.context + ' - IUser';
        try {
            Logger.info('Starting', methodContext, {
                userId,
                language,
            });
            const result = await this.client.query(
                `UPDATE users
                     SET language = $1
                     WHERE id = $2
                     RETURNING *`,
                [language, userId],
            );

            if (result.rows.length === 0) {
                Logger.error('User not found', methodContext, { userId });
                return null;
            }

            Logger.info('Language updated successfully', methodContext, {
                userId,
                language,
            });
            return result.rows[0] as IUser;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                language,
                message: error.message,
            });
            throw new Error('Failed to update user language');
        }
    }

    /**
     * Update device information including Firebase token
     */
    public async updateDeviceInfo(
        userId: string,
        token: string,
        metadata: DeviceMetadata,
    ): Promise<void> {
        const methodContext = this.context + ' - void';
        try {
            Logger.info('Starting', methodContext, {
                userId,
            });

            // Check if user exists
            const userExists = await this.client.query(
                'SELECT id FROM users WHERE id = $1',
                [userId],
            );

            if (userExists.rows.length === 0) {
                Logger.error('User not found', methodContext, { userId });
                throw new Error('User not found');
            }

            // UPSERT operation - Insert if not exists, update if exists
            Logger.info('Upserting device info', methodContext, { userId });
            await this.client.query(
                `INSERT INTO user_firebase_tokens 
                  (user_id, firebase_token, device_metadata)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, firebase_token) 
                 DO UPDATE SET 
                  device_metadata = $3,
                  updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [userId, token, JSON.stringify(metadata)],
            );
            Logger.info('Device info updated successfully', methodContext, {
                userId,
            });
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                message: error.message,
            });
            throw new Error('Failed to update device information');
        }
    }

    public async getUsersNearMe(
        userId: string,
        filters: {
            city_ids?: number[];
            radius?: number | null;
        },
        limit: number = 20, // Default limit of results
    ): Promise<{ users: IUserProfile[]; code: string | null }> {
        const methodContext = this.context + ' - IUserProfile';
        try {
            Logger.info('Starting', methodContext, {
                userId,
                filters,
                limit,
            });

            // Get the user's current location coordinates
            const userLocationResult = await this.client.query(
                `
                SELECT location AS coordinates 
                FROM users
                WHERE id = $1
                `,
                [userId],
            );

            if (userLocationResult.rows.length === 0) {
                Logger.error('User location not found', methodContext, {
                    userId,
                });
                throw new Error('User location not found');
            }

            const userCoordinates = userLocationResult.rows[0].coordinates;
            Logger.info('Retrieved user coordinates', methodContext, {
                userId,
            });

            // Build the base query
            let baseQuery = `
                SELECT 
                    u.id,
                    u.bio,
                    u.first_name,
                    u.address,
                    u.last_name,
                    u.date_of_birth,
                    ST_Distance(u.location, $1) AS distance,
                    ST_AsText(u.location) AS location_text,
                    ST_X(u.location::geometry) AS longitude,
                    ST_Y(u.location::geometry) AS latitude
                FROM users u
                WHERE 
                    u.id != $2 AND
                    u.location IS NOT NULL 
            `;

            const params = [userCoordinates, userId];

            // Apply filters - either city-based OR radius-based, not both
            if (filters.city_ids && filters.city_ids.length > 0) {
                // City-based filtering - ignore radius, only get users within specified cities
                const cityIdPlaceholders = filters.city_ids
                    .map((_, index) => `$${params.length + 1 + index}`)
                    .join(',');
                baseQuery += ` AND EXISTS (
                    SELECT 1 
                    FROM locations l
                    WHERE l.city_id IN (${cityIdPlaceholders})
                    AND l.coordinates IS NOT NULL
                    AND ST_DWithin(u.location, l.coordinates, 50000)
                )`;
                params.push(...filters.city_ids);
            } else if (filters.radius) {
                // Radius-based filtering - get users within specified radius from user's location
                baseQuery += ` AND ST_DWithin(u.location, $1, $${params.length + 1}) `;
                params.push(filters.radius);
            }

            // Add the exclusion for already swiped users
            baseQuery += ` AND NOT EXISTS (
                    SELECT 1 
                    FROM host_subletter_swipes hss 
                    WHERE hss.host_id = $2 AND hss.subletter_id = u.id
                )
            `;

            // Add ordering and limit
            baseQuery += `
                ORDER BY distance
                LIMIT $${params.length + 1}
            `;

            params.push(limit);

            Logger.info('Finding nearby users', methodContext, {
                userId,
                filters,
            });

            const nearbyUsersResult = await this.client.query(
                baseQuery,
                params,
            );

            if (nearbyUsersResult.rows.length === 0) {
                Logger.info('No nearby users found', methodContext, { userId });

                // Check if there are any users we haven't swiped yet
                const swipeCheckQuery = `
                    SELECT COUNT(*) AS unswiped_count
                    FROM users u
                    WHERE 
                        u.id != $1 AND
                        u.location IS NOT NULL AND
                        NOT EXISTS (
                            SELECT 1 
                            FROM host_subletter_swipes hss 
                            WHERE hss.host_id = $1 AND hss.subletter_id = u.id
                        )
                `;

                const swipeCheckResult = await this.client.query(
                    swipeCheckQuery,
                    [userId],
                );
                const unswipedCount = parseInt(
                    swipeCheckResult.rows[0].unswiped_count,
                );

                let code = null;
                if (unswipedCount === 0) {
                    // We've swiped on all users
                    code = 'allUsersSwiped';
                    Logger.info(
                        'All nearby users have been swiped',
                        methodContext,
                        { userId },
                    );
                } else {
                    // There are no users in the specified area
                    code = 'noNearbyUsers';
                    Logger.info(
                        'No users exist in the specified area',
                        methodContext,
                        {
                            userId,
                        },
                    );
                }

                return { users: [], code };
            }

            // Get user IDs for all nearby users
            const userIds = nearbyUsersResult.rows.map((row) => row.id);

            // Fetch all photos for these users in a single query
            const userIdPlaceholders = userIds
                .map((_, index) => `$${index + 1}`)
                .join(',');
            const photosQuery = `
                SELECT user_id, photo_url, is_profile
                FROM user_photos
                WHERE user_id IN (${userIdPlaceholders})
                ORDER BY user_id, is_profile DESC, created_at
            `;

            const photosResult = await this.client.query(photosQuery, userIds);

            // Create a map of user IDs to their photos
            const userPhotosMap = new Map<string, string[]>();
            photosResult.rows.forEach((photo) => {
                if (!userPhotosMap.has(photo.user_id)) {
                    userPhotosMap.set(photo.user_id, []);
                }
                userPhotosMap.get(photo.user_id)!.push(photo.photo_url);
            });

            const nearbyUsers: IUserProfile[] = nearbyUsersResult.rows.map(
                (row) => ({
                    id: row.id,
                    bio: row.bio,
                    first_name: row.first_name,
                    location:
                        row.address?.city && row.address?.country
                            ? row.address.city + ', ' + row.address.country
                            : 'No location',
                    last_name: row.last_name,
                    photos: userPhotosMap.get(row.id) || [],
                    date_of_birth: row.date_of_birth,
                    distance: row.distance,
                }),
            );

            Logger.info('Found nearby users', methodContext, {
                userId,
                count: nearbyUsers.length,
            });

            // If results are not empty, code is null
            return { users: nearbyUsers, code: null };
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                message: error.message,
            });
            throw new Error(
                'Error finding nearby user sublets: ' + error.message,
            );
        }
    }

    public async likeUserSublet(
        hostId: string,
        subletterId: string,
    ): Promise<void> {
        const methodContext = this.context + ' - void';
        try {
            Logger.info('Starting', methodContext, {
                hostId,
                subletterId,
            });
            const result = await this.client.query(
                `
                INSERT INTO host_subletter_swipes
                    (host_id, subletter_id, is_favorite, created_at)
                VALUES
                    ($1, $2, true, CURRENT_TIMESTAMP)
                ON CONFLICT (host_id, subletter_id) 
                DO UPDATE SET is_favorite = true, created_at = CURRENT_TIMESTAMP
                RETURNING *
                `,
                [hostId, subletterId],
            );
            if (result.rows.length === 0) {
                Logger.error('Failed to like user sublet', methodContext, {
                    hostId,
                    subletterId,
                });
                throw new Error('Failed to like user sublet');
            }

            Logger.info('Sublet liked successfully', methodContext, {
                hostId,
                subletterId,
            });
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                hostId,
                subletterId,
                message: error.message,
            });
            throw new Error('Error ' + error.message);
        }
    }

    public async unlikeUserSublet(
        hostId: string,
        subletterId: string,
    ): Promise<void> {
        const methodContext = this.context + ' - void';
        try {
            Logger.info('Starting', methodContext, {
                hostId,
                subletterId,
            });
            const result = await this.client.query(
                `
                INSERT INTO host_subletter_swipes
                    (host_id, subletter_id, is_favorite, created_at)
                VALUES
                    ($1, $2, false, CURRENT_TIMESTAMP)
                ON CONFLICT (host_id, subletter_id) 
                DO UPDATE SET is_favorite = false, created_at = CURRENT_TIMESTAMP
                RETURNING *
                `,
                [hostId, subletterId],
            );
            if (result.rows.length === 0) {
                Logger.error('Failed to unlike user sublet', methodContext, {
                    hostId,
                    subletterId,
                });
                throw new Error('Failed to unlike user sublet');
            }

            Logger.info('Sublet unliked successfully', methodContext, {
                hostId,
                subletterId,
            });
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                hostId,
                subletterId,
                message: error.message,
            });
            throw new Error('Error ' + error.message);
        }
    }

    public async getUserSwipes(
        hostId: string,
        status?: string,
        limit: number = 20, // Default limit of results
        offset: number = 0, // Default offset for pagination
    ): Promise<IUserRequest[]> {
        const methodContext = this.context + ' - IUserRequest';
        try {
            Logger.info('Starting', methodContext, {
                hostId,
                status,
                limit,
                offset,
            });

            // Initialize params array
            const params: any[] = [hostId];

            // Build the base query
            let query = `
                SELECT 
                    u.id,
                    u.bio,
                    u.first_name,
                    u.address,
                    u.last_name,
                    u.date_of_birth,
                    ps.created_at,
                    ps.status,
                    p.title AS property_title,
                    p.id AS property_id,
                    ST_Distance(u.location, h.location) AS distance,
                    ST_X(u.location::geometry) AS longitude,
                    ST_Y(u.location::geometry) AS latitude,
                    -- Add conversation_id with a left join so we get NULL if no conversation exists
                    c.id AS conversation_id,
                    -- Get array of photo URLs from user_photos
                    ARRAY_AGG(up.photo_url ORDER BY (up.is_profile = true) DESC, up.created_at ASC) FILTER (WHERE up.photo_url IS NOT NULL) AS photo_urls
                FROM property_swipes ps
                JOIN properties p ON ps.property_id = p.id
                JOIN users u ON ps.user_id = u.id
                JOIN users h ON p.host_id = h.id
                -- Left join to get conversation ID if it exists
                LEFT JOIN conversations c ON c.property_id = p.id AND c.user_id = u.id
                -- Left join to get user photos
                LEFT JOIN user_photos up ON u.id = up.user_id
                WHERE p.host_id = $1
                AND ps.status IN ('pending', 'approved')
            `;

            // Add status filter if provided
            if (status !== undefined) {
                query += ` AND ps.status = $${params.length + 1}`;
                params.push(status);
            }

            // Add GROUP BY clause to handle the array_agg function
            query += `
                GROUP BY 
                    u.id, 
                    u.bio, 
                    u.first_name, 
                    u.address, 
                    u.last_name, 
                    u.date_of_birth, 
                    ps.created_at, 
                    ps.status, 
                    p.title, 
                    p.id, 
                    distance, 
                    longitude, 
                    latitude, 
                    c.id
            `;

            // Add ordering, limit and offset
            query += ` ORDER BY ps.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limit, offset);

            Logger.info('Executing query', methodContext, {
                hostId,
                paramCount: params.length,
            });
            const swipedUsersResult = await this.client.query(query, params);

            if (swipedUsersResult.rows.length === 0) {
                Logger.info('No swipes found', methodContext, { hostId });
                return [];
            }

            const swipedUsers: IUserRequest[] = swipedUsersResult.rows.map(
                (row) => {
                    const userRequest: IUserRequest = {
                        id: row.id,
                        bio: row.bio,
                        first_name: row.first_name,
                        last_name: row.last_name,
                        photos: row.photo_urls || [], // Use the array of photo URLs
                        location: row.address
                            ? row.address.city + ', ' + row.address.country
                            : 'No location',
                        date_of_birth: row.date_of_birth,
                        distance: row.distance,
                        created_at: row.created_at,
                        status: row.status ?? 'pending',
                        property: {
                            id: row.property_id,
                            title: row.property_title,
                        },
                    };

                    // Add conversation_id only if the status is approved and a conversation exists
                    if (
                        row.status === 'approved' &&
                        row.conversation_id !== null
                    ) {
                        userRequest.conversation_id = row.conversation_id;
                    }

                    return userRequest;
                },
            );

            Logger.info('Successfully retrieved swipes', methodContext, {
                hostId,
                count: swipedUsers.length,
            });
            return swipedUsers;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                hostId,
                message: error.message,
            });
            throw new Error(
                'Error finding users who swiped on host properties: ' +
                    error.message,
            );
        }
    }

    public async getUserRequest(requestId: string): Promise<IUserRequest> {
        const methodContext = this.context + ' - getUserRequest';
        try {
            Logger.info('Starting', methodContext, {
                requestId,
            });

            // Build the query to get a specific user request with photos
            const query = `
                SELECT 
                    u.id,
                    u.bio,
                    u.first_name,
                    u.last_name,
                    u.date_of_birth,
                    ps.created_at,
                    ps.updated_at,
                    c.name as city,
                    s.name as state,
                    co.name as country,
                    p.title AS property_title,
                    p.id AS property_id,
                    ps.status,
                    ST_Distance(u.location, h.location) AS distance,
                    ST_X(u.location::geometry) AS longitude,
                    ST_Y(u.location::geometry) AS latitude,
                    -- Get array of photo URLs from user_photos
                    ARRAY_AGG(up.photo_url ORDER BY (up.is_profile = true) DESC, up.created_at ASC) FILTER (WHERE up.photo_url IS NOT NULL) AS photo_urls
                FROM property_swipes ps
                JOIN properties p ON ps.property_id = p.id
                JOIN users u ON ps.user_id = u.id
                JOIN users h ON p.host_id = h.id
                JOIN locations l ON p.location_id = l.id
                JOIN cities c ON l.city_id = c.id
                LEFT JOIN states s ON c.state_id = s.id
                JOIN countries co ON c.country_id = co.id
                -- Left join to get user photos
                LEFT JOIN user_photos up ON u.id = up.user_id
                WHERE ps.id = $1
                GROUP BY 
                    u.id,
                    u.bio,
                    u.first_name,
                    u.last_name,
                    u.date_of_birth,
                    ps.created_at,
                    ps.updated_at,
                    c.name,
                    s.name,
                    co.name,
                    p.title,
                    p.id,
                    ps.status,
                    distance,
                    longitude,
                    latitude
                LIMIT 1
            `;

            Logger.info('Executing query', methodContext, {
                requestId,
            });
            const result = await this.client.query(query, [requestId]);

            if (result.rows.length === 0) {
                Logger.error('No request found', methodContext, { requestId });
                throw new Error('No user request found');
            }

            const row = result.rows[0];

            const userProfile: IUserRequest = {
                id: row.id,
                bio: row.bio,
                first_name: row.first_name,
                last_name: row.last_name,
                photos: row.photo_urls || [], // Use the array of photo URLs
                location: row.city + ', ' + (row.state ?? row.country),
                date_of_birth: row.date_of_birth,
                distance: row.distance,
                created_at: row.created_at,
                status: row.status ?? 'pending',
                property: {
                    id: row.property_id,
                    title: row.property_title,
                },
            };

            Logger.info('Request found successfully', methodContext, {
                requestId,
                userId: row.id,
                photoCount: userProfile.photos.length,
            });

            return userProfile;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                requestId,
                message: error.message,
            });
            throw new Error('Error finding user request: ' + error.message);
        }
    }

    public async rejectUserRequest(
        hostId: string,
        userId: string,
    ): Promise<void> {
        const methodContext = this.context + ' - void';
        try {
            Logger.info('Starting', methodContext, {
                hostId,
                userId,
            });

            // Find the property swipe record where:
            // 1. The property belongs to the host
            // 2. The user who swiped is the one being rejected
            // 3. The status is currently 'pending'

            Logger.info('Executing update', methodContext, { hostId, userId });
            const result = await this.client.query(
                `
                UPDATE property_swipes ps
                SET 
                    status = 'rejected',
                    updated_at = CURRENT_TIMESTAMP
                FROM properties p
                WHERE 
                    ps.property_id = p.id AND
                    p.host_id = $1 AND
                    ps.user_id = $2 AND
                    ps.status = 'pending'
                RETURNING ps.*
                `,
                [hostId, userId],
            );

            if (result.rows.length === 0) {
                Logger.error('No pending request found', methodContext, {
                    hostId,
                    userId,
                });
                throw new Error('No pending request found to reject');
            }

            Logger.info('Request rejected successfully', methodContext, {
                hostId,
                userId,
                swipeId: result.rows[0].id,
            });
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                hostId,
                userId,
                message: error.message,
            });
            throw new Error('Error rejecting user request: ' + error.message);
        }
    }

    public async approveUserRequest(
        userId: string,
        propertyId: string,
    ): Promise<string> {
        const methodContext = this.context + ' - string';
        try {
            Logger.info('Starting', methodContext, {
                userId,
                propertyId,
            });

            // Find the property swipe record where:
            // 1. The property belongs to the host
            // 2. The user who swiped is the one being approved
            // 3. The status is currently 'pending'

            Logger.info('Executing update', methodContext, {
                userId,
                propertyId,
            });
            const result = await this.client.query(
                `
                UPDATE property_swipes ps
                SET 
                    status = 'approved',
                    updated_at = CURRENT_TIMESTAMP
                FROM properties p
                WHERE 
                    ps.property_id = p.id AND
                    ps.user_id = $1 AND
                    p.id = $2 AND
                    ps.status = 'pending'
                RETURNING ps.*
                `,
                [userId, propertyId],
            );

            if (result.rows.length === 0) {
                Logger.error('No pending request found', methodContext, {
                    userId,
                    propertyId,
                });
                throw new Error('No pending request found to approve');
            }

            Logger.info('Request approved successfully', methodContext, {
                userId,
                propertyId,
                swipeId: result.rows[0].id,
            });
            return result.rows[0].id; // Id of the property_swipe record
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                propertyId,
                message: error.message,
            });
            throw new Error('Error approving user request: ' + error.message);
        }
    }

    public async getPhotoByDisplayOrder(
        userId: string,
        displayOrder: number,
    ): Promise<IUserPhoto | null> {
        const methodContext = this.context + ' - getPhotoByDisplayOrder';
        try {
            Logger.info('Starting', methodContext, {
                userId,
                displayOrder,
            });
            const result = await this.client.query(
                `SELECT * 
                 FROM user_photos 
                 WHERE user_id = $1 AND display_order = $2`,
                [userId, displayOrder],
            );

            if (result.rows.length === 0) {
                Logger.error('No photo found', methodContext, {
                    userId,
                    displayOrder,
                });
                return null;
            }

            Logger.info('Photo found successfully', methodContext, {
                userId,
                displayOrder,
            });
            return result.rows[0] as IUserPhoto;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                userId,
                displayOrder,
                message: error.message,
            });
            throw new Error('Error finding photo: ' + error.message);
        }
    }

    public async updatePhotoUrl(
        photoId: number,
        newUrl: string,
    ): Promise<void> {
        await this.client.query(
            'UPDATE user_photos SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newUrl, photoId],
        );
    }

    public async saveUserPhotoAtPosition(
        userId: number,
        photoUrl: string,
        isProfile: boolean,
        displayOrder: number,
    ): Promise<number> {
        const result = await this.client.query(
            'INSERT INTO user_photos(user_id, photo_url, is_profile, display_order) VALUES($1, $2, $3, $4) RETURNING id',
            [userId, photoUrl, isProfile, displayOrder],
        );
        return result.rows[0].id;
    }

    public async getUserSubletDetails(
        requestId: string,
    ): Promise<IUserProfile> {
        const methodContext = this.context + ' - getUserSubletDetails';
        try {
            Logger.info('Starting', methodContext, {
                requestId,
            });

            // Build the query to get a specific user request with photos
            const query = `
                SELECT 
                    u.id,
                    u.bio,
                    u.first_name,
                    u.last_name,
                    u.date_of_birth,
                    -- Get array of photo URLs from user_photos
                    ARRAY_AGG(up.photo_url ORDER BY (up.is_profile = true) DESC, up.created_at ASC) FILTER (WHERE up.photo_url IS NOT NULL) AS photo_urls
                FROM users u
                -- Left join to get user photos
                LEFT JOIN user_photos up ON u.id = up.user_id
                WHERE u.id = $1
            `;

            Logger.info('Executing query', methodContext, {
                requestId,
            });
            const result = await this.client.query(query, [requestId]);

            if (result.rows.length === 0) {
                Logger.error('No request found', methodContext, { requestId });
                throw new Error('No user request found');
            }

            const row = result.rows[0];

            const userProfile: IUserProfile = {
                id: row.id,
                bio: row.bio,
                first_name: row.first_name,
                last_name: row.last_name,
                photos: row.photo_urls || [],
                date_of_birth: row.date_of_birth,
                distance: row.distance,
            };

            Logger.info('User found successfully', methodContext, {
                requestId,
                userId: row.id,
                photoCount: userProfile.photos.length,
            });

            return userProfile;
        } catch (error: any) {
            Logger.error('Error', methodContext, {
                requestId,
                message: error.message,
            });
            throw new Error(
                'Error finding user sublet details: ' + error.message,
            );
        }
    }
}

export default UserService;
