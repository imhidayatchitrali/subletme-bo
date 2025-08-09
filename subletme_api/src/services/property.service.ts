
import { Client } from '../database';
import { calculateAverageRating } from '../helpers/property.helper';
import {
IPlaceItem,
IProperty,
IPropertyById,
IPropertyDetail,
IPropertyDisplay,
IPropertyPublishInput,
IPropertySwipe,
IPropertyUpdateInput,
PropertyInRange,
} from '../models/property.model';
import Logger from '../utils/logger';

class PropertyService {
private client: Client;
private context: string;

constructor() {
    this.context = 'PropertyService';
    this.client = new Client();
    Logger.info('Initializing', this.context + ' - constructor');
}

public async getPlaceTypes(): Promise<IPlaceItem[]> {
    const methodContext = this.context + ' - getPlaceTypes';
    try {
        Logger.info('Fetching place types', methodContext);

        const result = await this.client.query(`SELECT * FROM place_types`);

        Logger.info('Successfully fetched place types', methodContext, {
            count: result.rows.length,
        });

        return result.rows as IPlaceItem[];
    } catch (error) {
        Logger.error('Error fetching place types', methodContext, error);
        throw new Error('Failed to fetch place types');
    }
}

public async getAmenities(): Promise<IPlaceItem[]> {
    const methodContext = this.context + ' - getAmenities';
    try {
        Logger.info('Fetching amenities', methodContext);

        const result = await this.client.query(`SELECT * FROM amenities`);

        Logger.info('Successfully fetched amenities', methodContext, {
            count: result.rows.length,
        });

        return result.rows as IPlaceItem[];
    } catch (error) {
        Logger.error('Error fetching amenities', methodContext, error);
        throw new Error('Failed to fetch amenities');
    }
}

public async getStyles(): Promise<IPlaceItem[]> {
    const methodContext = this.context + ' - getStyles';
    try {
        Logger.info('Fetching styles', methodContext);

        const result = await this.client.query(`SELECT * FROM styles`);

        Logger.info('Successfully fetched styles', methodContext, {
            count: result.rows.length,
        });

        return result.rows as IPlaceItem[];
    } catch (error) {
        Logger.error('Error fetching styles', methodContext, error);
        throw new Error('Failed to fetch styles');
    }
}

public async getRules(): Promise<IPlaceItem[]> {
    const methodContext = this.context + ' - getRules';
    try {
        Logger.info('Fetching rules', methodContext);

        const result = await this.client.query(`SELECT * FROM rules`);

        Logger.info('Successfully fetched rules', methodContext, {
            count: result.rows.length,
        });

        return result.rows as IPlaceItem[];
    } catch (error) {
        Logger.error('Error fetching rules', methodContext, error);
        throw new Error('Failed to fetch rules');
    }
}

public async publishProperty(
    input: IPropertyPublishInput,
    userId: string,
): Promise<string> {
    const methodContext = this.context + ' - publishProperty';
    try {
        Logger.info('Starting property publication', methodContext, {
            userId,
        });

        await this.client.beginTransaction();
        // 1. Insert location first to get location_id
        Logger.info('Inserting location', methodContext);

        const locationQuery = `
            INSERT INTO locations (city_id, address, coordinates)
            VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
            RETURNING id`;

        const locationResult = await this.client.query(locationQuery, [
            input.location_item.city_id,
            input.address,
            input.longitude, // Note: ST_MakePoint takes longitude first, then latitude
            input.latitude,
        ]);

        const locationId = locationResult.rows[0].id as number;
        Logger.info('Location inserted', methodContext, { locationId });

        // Log property insertion
        Logger.info('Inserting property', methodContext);

        // 2. Insert main property record
        const propertyQuery = `
            INSERT INTO properties (
                host_id, place_type_id, location_id, max_guests,
                bedrooms, beds, bathrooms, roommates, size_sqm,
                title, description, last_minute_enabled, parking_spot
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id`;

        const propertyResult = await this.client.query(propertyQuery, [
            userId,
            input.place_type_id,
            locationId,
            input.basics.max_guests,
            input.basics.bedrooms,
            input.basics.beds,
            input.basics.bathrooms,
            input.basics.roommates,
            input.basics.size_sqm,
            input.title,
            input.description,
            input.last_minute_offer,
            input.basics.parking_spot,
        ]);

        const propertyId = propertyResult.rows[0].id;
        Logger.info('Property inserted', methodContext, { propertyId });

        Logger.info('Inserting property dates', methodContext, {
            startDate: input.start_date,
            endDate: input.end_date,
        });

        Logger.info('Inserting junction records', methodContext, {
            amenitiesCount: input.amenities_id.length,
            stylesCount: input.styles_id.length,
            rulesCount: input.rules_id.length,
        });

        // 3. Insert junction table records
        const insertJunctionRecords = async (
            table: string,
            key_id: string,
            ids: number[],
        ) => {
            const values = ids
                .map((id, index) => `($1, $${index + 2})`)
                .join(',');
            const query = `
                INSERT INTO ${table} (property_id, ${key_id})
                VALUES ${values}`;
            if (ids.length === 0) return;
            await this.client.query(query, [propertyId, ...ids]);
        };

        const datesQuery = `
                INSERT INTO property_dates (property_id, start_date, end_date, price_per_night)
                VALUES ($1, $2, $3, $4)`;

        await this.client.query(datesQuery, [
            propertyId,
            input.start_date,
            input.end_date,
            input.price,
        ]),
            // Insert all junction records in parallel
            await Promise.all([
                insertJunctionRecords(
                    'property_amenities',
                    'amenity_id',
                    input.amenities_id,
                ),
                insertJunctionRecords(
                    'property_styles',
                    'style_id',
                    input.styles_id,
                ),
                insertJunctionRecords(
                    'property_rules',
                    'rule_id',
                    input.rules_id,
                ),
            ]);

        Logger.info('Property published successfully', methodContext, {
            propertyId,
        });

        await this.client.commit();
        return propertyId;
    } catch (error) {
        await this.client.rollback();
        Logger.error('Error publishing property', methodContext, error);
        throw new Error('Failed to publish property');
    } finally {
        await this.client.release(); // Always release connection
    }
}

public async savePropertyPhotos(propertyId: string, photos: string[]) {
    const methodContext = this.context + ' - savePropertyPhotos';
    try {
        Logger.info('Saving photos', methodContext, {
            propertyId,
            photoCount: photos.length,
        });

        await this.client.beginTransaction();
        const photoQuery = `
            INSERT INTO property_photos (property_id, photo_url, display_order)
            VALUES ($1, $2, $3)`;

        await Promise.all(
            photos.map((photo, index) =>
                this.client.query(photoQuery, [
                    propertyId,
                    photo,
                    index + 1,
                ]),
            ),
        );

        await this.client.commit();
        Logger.info('Photos saved successfully', methodContext, {
            propertyId,
        });
    } catch (error) {
        await this.client.rollback();
        Logger.error('Error saving photos', methodContext, error);
        throw new Error('Failed to savePropertyPhotos');
    } finally {
        await this.client.release(); // Always release connection
    }
}

public async getProperties(userId: string): Promise<IProperty[]> {
    const methodContext = this.context + ' - getProperties';
    try {
        Logger.info('Fetching properties', methodContext, { userId });

        const result = await this.client.query(
            `
            WITH items AS (
                SELECT 
                    property_id,
                    amenity_id as id,
                    a.name,
                    a.icon,
                    'amenity' as type
                FROM property_amenities pa
                JOIN amenities a ON pa.amenity_id = a.id
                UNION ALL
                SELECT 
                    property_id,
                    style_id as id,
                    s.name,
                    s.icon,
                    'style' as type
                FROM property_styles ps
                JOIN styles s ON ps.style_id = s.id
                UNION ALL
                SELECT 
                    p.id as property_id,
                    pt.id,
                    pt.name,
                    pt.icon,
                    'type' as type
                FROM properties p
                JOIN place_types pt ON p.place_type_id = pt.id
            ),
            property_data AS (
                SELECT 
                    p.*,
                    json_agg(DISTINCT pp.photo_url) as photos,
                    json_agg(DISTINCT
                        jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'icon', i.icon,
                            'type', i.type
                        )
                    ) as place_items,
                    jsonb_build_object(
                        'photo_url', (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id AND up.is_profile = true LIMIT 1),
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    ) as host,
                    json_agg(DISTINCT jsonb_build_object(
                        'start_date', pd.start_date,
                        'end_date', pd.end_date,
                        'price', pd.price_per_night
                    )) as dates,
                    c.name as city,
                    co.name as country
                FROM properties p
                LEFT JOIN property_photos pp ON p.id = pp.property_id
                LEFT JOIN items i ON p.id = i.property_id
                LEFT JOIN users u ON p.host_id = u.id
                LEFT JOIN locations l ON p.location_id = l.id
                LEFT JOIN cities c ON l.city_id = c.id
                LEFT JOIN countries co ON c.country_id = co.id
                LEFT JOIN property_dates pd ON p.id = pd.property_id 
                WHERE 
                    NOT EXISTS (
                        SELECT 1 
                        FROM property_swipes ps
                        WHERE 
                            ps.property_id = p.id
                            AND ps.user_id = $1
                            AND (
                                ps.hide_until > CURRENT_TIMESTAMP
                                OR ps.status IN ('pending', 'approved')
                            )
                    )
                    AND p.host_id != $1
                    AND p.deleted_at IS NULL
                GROUP BY p.id, u.id, u.first_name, u.last_name, c.name, co.name
            )
            SELECT 
                id,
                beds,
                bathrooms,
                bedrooms,
                max_guests,
                roommates,
                size_sqm,
                dates,
                photos,
                place_items,
                host,
                city,
                country
            FROM property_data
            ORDER BY created_at DESC
            `,
            [userId],
        );

        Logger.info('Properties fetched successfully', methodContext, {
            count: result.rows.length,
        });

        // Transform the results to match IProperty interface
        return result.rows.map((row) => ({
            ...row,
            photos: row.photos?.filter((i: string | null) => i) ?? [],
            place_items: (row.place_items || []).filter(
                (item: { id: string | null }) => item.id != null,
            ),
            host: row.host,
        }));
    } catch (error) {
        Logger.error('Error fetching properties', methodContext, error);
        throw new Error('Failed to fetch properties');
    }
}

public async getPropertiesByFilters(
    userId: string,
    locationId?: number,
    filters: {
        distance?: number | null;
        city_ids?: number[];
        min_price?: number;
        max_price?: number;
        date_start?: number;
        date_end?: number;
        bathrooms?: number;
        bedrooms?: number;
        placeTypes?: string[];
        furnished?: boolean;
        options?: string[];
        // Add more filters as needed
    } = {},
): Promise<IProperty[]> {
    const methodContext = this.context + ' - getPropertiesByFilters';
    try {
        Logger.info('Fetching properties by filters', methodContext, {
            userId,
            locationId,
            filters: JSON.stringify(filters),
        });

        // Start building the query and parameters
        const queryParams: any[] = [userId];

        const baseQuery = `
        WITH items AS (
            SELECT 
                property_id,
                amenity_id as id,
                a.name,
                a.icon,
                'amenity' as type
            FROM property_amenities pa
            JOIN amenities a ON pa.amenity_id = a.id
            UNION ALL
            SELECT 
                property_id,
                style_id as id,
                s.name,
                s.icon,
                'style' as type
            FROM property_styles ps
            JOIN styles s ON ps.style_id = s.id
            UNION ALL
            SELECT 
                p.id as property_id,
                pt.id,
                pt.name,
                pt.icon,
                'type' as type
            FROM properties p
            JOIN place_types pt ON p.place_type_id = pt.id
        )
        `;

        // Build dynamic conditions for WHERE clause
        const whereConditions = [
            `NOT EXISTS (
                SELECT 1 
                FROM property_swipes ps
                WHERE 
                    ps.property_id = p.id
                    AND ps.user_id = $1
                    AND (
                        ps.hide_until > CURRENT_TIMESTAMP
                        OR ps.status IN ('pending', 'approved')
                    )
            )`,
        ];

        // Distance and location-based filtering
        let distanceSelect = '';
        let orderByClause = '';

        if (locationId) {
            queryParams.push(locationId);
            const locationParamIndex = queryParams.length;

            distanceSelect = `, ST_Distance(l.coordinates::geography, $${locationParamIndex}::geography) as distance`;

            // Only add distance filter if filters.distance is not null
            if (
                filters.distance !== null &&
                filters.distance !== undefined
            ) {
                queryParams.push(filters.distance);
                const distanceParamIndex = queryParams.length;

                whereConditions.push(
                    `ST_Distance(l.coordinates::geography, $${locationParamIndex}::geography) <= $${distanceParamIndex}`,
                );
            }

            orderByClause = `ORDER BY distance ASC`;
        } else {
            // Default sorting if no location provided
            distanceSelect = ', NULL as distance';
            orderByClause = `ORDER BY p.created_at DESC`;
        }

        queryParams.push(userId);
        whereConditions.push(`p.host_id != $${queryParams.length}`);

        // City-based filtering
        if (
            filters.city_ids &&
            Array.isArray(filters.city_ids) &&
            filters.city_ids.length > 0
        ) {
            // Use the ANY operator with an array parameter
            queryParams.push(filters.city_ids);
            whereConditions.push(`l.city_id = ANY($${queryParams.length})`);
        }

        // Bathrooms filter
        if (filters.bathrooms !== undefined) {
            queryParams.push(filters.bathrooms);
            whereConditions.push(`p.bathrooms >= $${queryParams.length}`);
        }

        // Bedrooms filter
        if (filters.bedrooms !== undefined) {
            queryParams.push(filters.bedrooms);
            whereConditions.push(`p.bedrooms >= $${queryParams.length}`);
        }

        // Place types filter
        if (filters.placeTypes && filters.placeTypes.length > 0) {
            queryParams.push(filters.placeTypes);
            whereConditions.push(
                `p.place_type_id = ANY($${queryParams.length}::int[])`,
            );
        }
        // Options filter
        if (filters.options && filters.options.length > 0) {
            // if (filters.options.includes('roommates')) {
            //     queryParams.push('roommates');
            //     whereConditions.push(
            //         `p.roommates = $${queryParams.length}`,
            //     );
            // }
            if (filters.options.includes('parking_spot')) {
                queryParams.push(true);
                whereConditions.push(
                    `p.parking_spot = $${queryParams.length}`,
                );
            }
        }

        // Date-based filtering
        if (
            filters.date_start !== undefined &&
            filters.date_end !== undefined
        ) {
            // Add date_start parameter
            const dateStartSeconds = Math.floor(filters.date_start / 1000);
            queryParams.push(dateStartSeconds);
            const dateStartParamIndex = queryParams.length;

            // Add date_end parameter
            const dateEndSeconds = Math.floor(filters.date_end / 1000);
            queryParams.push(dateEndSeconds);
            const dateEndParamIndex = queryParams.length;

            // Add condition to find properties that have availability in the requested date range
            whereConditions.push(`
                EXISTS (
                    SELECT 1 
                    FROM property_dates pd2
                    WHERE 
                        pd2.property_id = p.id
                        AND pd2.start_date <= to_timestamp($${dateEndParamIndex})::date
                        AND pd2.end_date >= to_timestamp($${dateStartParamIndex})::date
                )
            `);
        }

        // Price-based filtering
        const havingConditions = [];

        if (filters.min_price) {
            queryParams.push(filters.min_price);
            havingConditions.push(
                `MIN(pd.price_per_night) >= $${queryParams.length}`,
            );
        }

        if (filters.max_price) {
            queryParams.push(filters.max_price);
            havingConditions.push(
                `MAX(pd.price_per_night) <= $${queryParams.length}`,
            );
        }

        const havingClause =
            havingConditions.length > 0
                ? `HAVING ${havingConditions.join(' AND ')}`
                : '';

        // Complete the query
        const query = `
        ${baseQuery}
        SELECT 
            p.*,
            json_agg(DISTINCT pp.photo_url) as photos,
            json_agg(DISTINCT
                jsonb_build_object(
                    'id', i.id,
                    'name', i.name,
                    'icon', i.icon,
                    'type', i.type
                )
            ) as place_items,
            jsonb_build_object(
                'photo_url', (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id AND up.is_profile = true LIMIT 1),
                'first_name', u.first_name,
                'last_name', u.last_name
            ) as host,
            json_agg(DISTINCT jsonb_build_object(
                'start_date', pd.start_date,
                'end_date', pd.end_date,
                'price', pd.price_per_night
            )) as dates,
            c.name as city,
            co.name as country
            ${distanceSelect}
        FROM properties p
        LEFT JOIN property_photos pp ON p.id = pp.property_id
        LEFT JOIN items i ON p.id = i.property_id
        LEFT JOIN users u ON p.host_id = u.id
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN cities c ON l.city_id = c.id
        LEFT JOIN countries co ON c.country_id = co.id
        LEFT JOIN property_dates pd ON p.id = pd.property_id
        WHERE ${whereConditions.join(' AND ')}
        AND p.deleted_at IS NULL
        GROUP BY p.id, u.id, u.first_name, u.last_name, c.name, co.name, l.coordinates
        ${havingClause}
        ${orderByClause}
    `;

        const result = await this.client.query(query, queryParams);
        Logger.info(
            'Properties fetched successfully by filters',
            methodContext,
            {
                count: result.rows.length,
            },
        );

        // Transform the results to match IProperty interface
        return result.rows.map((row) => ({
            ...row,
            photos: row.photos?.filter((i: string | null) => i) ?? [],
            place_items: (row.place_items || []).filter(
                (item: { id: string | null }) => item.id != null,
            ),
            host: row.host,
            distance_km: row.distance
                ? parseFloat(row.distance) / 1000
                : null, // Convert meters to kilometers if distance exists
        }));
    } catch (error) {
        Logger.error(
            'Error fetching properties by filters',
            methodContext,
            error,
        );
        throw new Error('Failed to fetch properties by filters');
    }
}

public async getPropertiesByCity(
    userId: string,
    cityId: number,
): Promise<IProperty[]> {
    const methodContext = this.context + ' - getPropertiesByCity';
    try {
        Logger.info('Fetching properties by city', methodContext, {
            userId,
            cityId,
        });

        const result = await this.client.query(
            `
            WITH items AS (
                SELECT 
                    property_id,
                    amenity_id as id,
                    a.name,
                    a.icon,
                    'amenity' as type
                FROM property_amenities pa
                JOIN amenities a ON pa.amenity_id = a.id
                UNION ALL
                SELECT 
                    property_id,
                    style_id as id,
                    s.name,
                    s.icon,
                    'style' as type
                FROM property_styles ps
                JOIN styles s ON ps.style_id = s.id
                UNION ALL
                SELECT 
                    p.id as property_id,
                    pt.id,
                    pt.name,
                    pt.icon,
                    'type' as type
                FROM properties p
                JOIN place_types pt ON p.place_type_id = pt.id
            ),
            property_data AS (
                SELECT 
                    p.*,
                    json_agg(DISTINCT pp.photo_url) as photos,
                    json_agg(DISTINCT
                        jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'icon', i.icon,
                            'type', i.type
                        )
                    ) as place_items,
                    jsonb_build_object(
                        'photo_url', u.photo_url,
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    ) as host,
                    json_agg(DISTINCT jsonb_build_object(
                        'start_date', pd.start_date,
                        'end_date', pd.end_date,
                        'price', pd.price_per_night
                    )) as dates,
                    c.name as city,
                    co.name as country
                FROM properties p
                LEFT JOIN property_photos pp ON p.id = pp.property_id
                LEFT JOIN items i ON p.id = i.property_id
                LEFT JOIN users u ON p.host_id = u.id
                LEFT JOIN locations l ON p.location_id = l.id
                LEFT JOIN cities c ON l.city_id = c.id
                LEFT JOIN countries co ON c.country_id = co.id
                LEFT JOIN property_dates pd ON p.id = pd.property_id
                WHERE 
                    NOT EXISTS (
                        SELECT 1 
                        FROM property_swipes ps
                        WHERE 
                            ps.property_id = p.id
                            AND ps.user_id = $1
                            AND ps.hide_until > CURRENT_TIMESTAMP
                    )
                    AND l.city_id = $2
                GROUP BY p.id, u.photo_url, u.first_name, u.last_name, c.name, co.name
            )
            SELECT 
                id,
                beds,
                bathrooms,
                bedrooms,
                max_guests,
                roommates,
                size_sqm,
                dates,
                photos,
                place_items,
                host,
                city,
                country
            FROM property_data
            ORDER BY created_at DESC
            `,
            [userId, cityId],
        );

        Logger.info(
            'Properties fetched successfully by city',
            methodContext,
            {
                count: result.rows.length,
            },
        );

        // Transform the results to match IProperty interface
        return result.rows.map((row) => ({
            ...row,
            photos: row.photos?.filter((i: string | null) => i) ?? [],
            place_items: (row.place_items || []).filter(
                (item: { id: string | null }) => item.id != null,
            ),
            host: row.host,
        }));
    } catch (error) {
        Logger.error(
            'Error fetching properties by city',
            methodContext,
            error,
        );
        throw new Error('Failed to fetch properties by city');
    }
}

public async getPropertyDetail(
    propertyId: string,
): Promise<IPropertyDetail> {
    const methodContext = `${this.context} ::: getPlaceTypes`;
    try {
        Logger.info('Fetching property detail', methodContext, {
            propertyId,
        });

        const result = await this.client.query(
            `
            WITH items AS (
                SELECT 
                    property_id,
                    amenity_id as id,
                    a.name,
                    a.icon,
                    'amenity' as type
                FROM property_amenities pa
                JOIN amenities a ON pa.amenity_id = a.id
                WHERE property_id = $1
                UNION ALL
                SELECT 
                    property_id,
                    style_id as id,
                    s.name,
                    s.icon,
                    'style' as type
                FROM property_styles ps
                JOIN styles s ON ps.style_id = s.id
                WHERE property_id = $1
                UNION ALL
                SELECT 
                    p.id as property_id,
                    pt.id,
                    pt.name,
                    pt.icon,
                    'type' as type
                FROM properties p
                JOIN place_types pt ON p.place_type_id = pt.id
                WHERE p.id = $1
            ),
            property_data AS (
                SELECT 
                    p.*,
                    json_agg(DISTINCT pp.photo_url) as photos,
                    json_agg(DISTINCT
                        jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'icon', i.icon,
                            'type', i.type
                        )
                    ) as place_items,
                    (
                        SELECT json_agg(amenity_id)
                        FROM property_amenities
                        WHERE property_id = p.id
                    ) as amenity_ids,
                    (
                        SELECT json_agg(style_id)
                        FROM property_styles
                        WHERE property_id = p.id
                    ) as style_ids,
                    jsonb_build_object(
                        'id', u.id,
                        'photo_url', (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id AND up.is_profile = true LIMIT 1),
                        'first_name', u.first_name,
                        'last_name', u.last_name,
                        'bio', u.bio
                    ) as host,
                    json_agg(DISTINCT jsonb_build_object(
                        'start_date', pd.start_date,
                        'end_date', pd.end_date,
                        'price', pd.price_per_night
                    )) as dates,
                    jsonb_build_object(
                        'address', l.address,
                        'coordinates', ST_AsGeoJSON(l.coordinates)::jsonb,
                        'city', c.name,
                        'country', co.name,
                        'city_id', c.id,
                        'country_id', co.id,
                        'state', s.name,
                        'state_id', s.id
                    ) as location,
                    (
                        SELECT json_agg(
                            jsonb_build_object(
                                'id', r.id,
                                'name', r.name,
                                'icon', r.icon
                            )
                        )
                        FROM property_rules pr
                        JOIN rules r ON pr.rule_id = r.id
                        WHERE pr.property_id = p.id
                    ) as rules,
                    (
                        SELECT json_agg(
                            jsonb_build_object(
                                'id', r.id,
                                'rating', r.rating,
                                'comment', r.comment,
                                'created_at', r.created_at,
                                'user', jsonb_build_object(
                                    'id', ru.id,
                                    'first_name', ru.first_name,
                                    'last_name', ru.last_name,
                                    'photo_url', (SELECT up.photo_url FROM user_photos up WHERE up.user_id = ru.id AND up.is_profile = true LIMIT 1)
                                )
                            )
                        )
                        FROM reviews r
                        JOIN users ru ON r.user_id = ru.id
                        WHERE r.property_id = p.id
                    ) as reviews
                FROM properties p
                LEFT JOIN property_photos pp ON p.id = pp.property_id
                LEFT JOIN items i ON p.id = i.property_id
                LEFT JOIN users u ON p.host_id = u.id
                LEFT JOIN locations l ON p.location_id = l.id
                LEFT JOIN cities c ON l.city_id = c.id
                LEFT JOIN states s ON c.state_id = s.id
                LEFT JOIN countries co ON c.country_id = co.id
                LEFT JOIN property_dates pd ON p.id = pd.property_id
                WHERE p.id = $1
                AND p.deleted_at IS NULL
                GROUP BY 
                    p.id, 
                    u.id, 
                    u.first_name, 
                    u.last_name, 
                    u.bio,
                    l.address,
                    l.coordinates,
                    c.name,
                    co.name,
                    s.name,
                    c.id,
                    co.id,
                    s.id
            )
            SELECT 
                id,
                title,
                description,
                beds,
                bathrooms,
                bedrooms,
                parking_spot,
                last_minute_enabled,
                place_type_id,
                max_guests,
                roommates,
                size_sqm,
                dates,
                photos,
                place_items,
                amenity_ids,
                style_ids,
                host,
                location,
                rules,
                reviews,
                created_at,
                updated_at
            FROM property_data
        `,
            [propertyId],
        );

        if (result.rows.length === 0) {
            Logger.error('Property not found', methodContext, {
                propertyId,
            });
            throw new Error('Property not found');
        }

        const propertyDetail = {
            ...result.rows[0],
            photos:
                result.rows[0].photos?.filter((i: string | null) => i) ??
                [],
            place_items: (result.rows[0].place_items || []).filter(
                (item: { id: string | null }) => item.id != null,
            ),
            rules: result.rows[0].rules || [],
            reviews: result.rows[0].reviews || [],
            dates:
                result.rows[0].dates?.filter(
                    (d: any) => d.start_date && d.end_date,
                ) ?? [],
            rating: calculateAverageRating(result.rows[0].reviews || []),
        };
        Logger.info('Property detail fetched successfully', methodContext);

        return propertyDetail;
    } catch (error) {
        Logger.error(
            'Error fetching property detail:',
            methodContext,
            error,
        );

        throw new Error('Failed to fetch property detail');
    }
}

public async getPropertiesForUser(
    userId: number,
    limit: number = 20,
): Promise<IProperty[]> {
    const methodContext = `${this.context} ::: getPropertiesForUser`;
    try {
        Logger.info('Fetching properties for user', methodContext, {
            userId,
            limit,
        });
        const result = await this.client.query(
            `
            WITH property_data AS (
                SELECT 
                    p.*,
                    json_agg(DISTINCT pp.photo_url) as photos,
                    json_agg(DISTINCT
                        jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'icon', i.icon,
                            'type', i.type
                        )
                    ) as place_items,
                    jsonb_build_object(
                        'photo_url', u.photo_url,
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    ) as host
                FROM properties p
                LEFT JOIN property_photos pp ON p.id = pp.property_id
                LEFT JOIN items i ON p.id = i.property_id
                LEFT JOIN users u ON p.host_id = u.id
                -- Exclude properties user has already swiped on
                WHERE NOT EXISTS (
                    SELECT 1 
                    FROM property_swipes ps 
                    WHERE ps.property_id = p.id 
                    AND ps.user_id = $1
                )
                GROUP BY p.id, u.photo_url, u.first_name, u.last_name
                ORDER BY p.created_at DESC
                LIMIT $2
            )
            SELECT * FROM property_data
            `,
            [userId, limit],
        );
        Logger.info('Properties fetched successfully', methodContext, {
            count: result.rows.length,
        });

        return result.rows.map((row) => ({
            ...row,
            photos: row.photos?.filter((i: string | null) => i) ?? [],
            place_items: (row.place_items || []).filter(
                (item: { id: string | null }) => item.id != null,
            ),
        }));
    } catch (error) {
        Logger.error(
            'Error fetching properties for user:',
            methodContext,
            error,
        );
        throw new Error('Failed to fetch properties');
    }
}

public async findPropertyById(id: string): Promise<IPropertyById | null> {
    const methodContext = `${this.context} ::: findPropertyById`;
    try {
        Logger.info('Fetching property by ID', methodContext, { id });
        const result = await this.client.query(
            `SELECT p.*,
                    l.id as location_id,
                    l.address,
                    c.id as city_id,
                    co.id as country_id
                    FROM properties p
                    JOIN locations l ON p.location_id = l.id
                    JOIN cities c ON l.city_id = c.id
                JOIN countries co ON c.country_id = co.id
                    WHERE p.id = $1
                    AND p.deleted_at IS NULL`,
            [id],
        );

        if (result.rows.length === 0) {
            return null;
        }
        Logger.info('Property fetched successfully', methodContext);

        return result.rows[0] as IPropertyById;
    } catch (error) {
        Logger.error('Error on findPropertyById:', methodContext, error);
        throw new Error('Failed on findPropertyById');
    }
}

public async unlikeProperty(
    userId: string,
    propertyId: string,
): Promise<void> {
    const methodContext = `${this.context} ::: unlikeProperty`;
    try {
        Logger.info('Unliking property', methodContext, {
            userId,
            propertyId,
        });
        // Begin transaction
        await this.client.beginTransaction();

        // Update or create the current swipe status
        await this.client.query(
            `INSERT INTO property_swipes (user_id, property_id, status, hide_until)
            VALUES ($1, $2, NULL, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (user_id, property_id) 
            DO UPDATE SET 
            status = NULL,
            hide_until = CURRENT_TIMESTAMP + INTERVAL '7 days',
            updated_at = CURRENT_TIMESTAMP`,
            [userId, propertyId],
        );

        // Record this swipe action in the history table
        await this.client.query(
            `INSERT INTO property_swipe_history (user_id, property_id, action)
            VALUES ($1, $2, 'dislike')`,
            [userId, propertyId],
        );

        // Commit transaction
        await this.client.commit();
        Logger.info('Property unliked successfully', methodContext);
    } catch (error) {
        // Rollback on error
        await this.client.rollback();
        Logger.error('Error unliking property:', methodContext, error);
        throw new Error('Failed on unlikeProperty');
    } finally {
        await this.client.release(); // Always release connection
    }
}

public async likeProperty(
    userId: string,
    propertyId: string,
): Promise<void> {
    const methodContext = `${this.context} ::: likeProperty`;
    try {
        Logger.info('Liking property', methodContext, {
            userId,
            propertyId,
        });

        // Begin transaction
        await this.client.beginTransaction();

        // Update current swipe status
        await this.client.query(
            `INSERT INTO property_swipes (user_id, property_id, status, hide_until)
                VALUES ($1, $2, 'pending', NULL)
                ON CONFLICT (user_id, property_id) 
                DO UPDATE SET 
                status = 'pending',
                hide_until = NULL,
                updated_at = CURRENT_TIMESTAMP`,
            [userId, propertyId],
        );

        // Record this swipe action in the history table
        await this.client.query(
            `INSERT INTO property_swipe_history (user_id, property_id, action)
                VALUES ($1, $2, 'like')`,
            [userId, propertyId],
        );

        // Commit transaction
        await this.client.commit();
        Logger.info('Property liked successfully', methodContext);
    } catch (error) {
        // Rollback on error
        await this.client.rollback();
        Logger.error('Error liking property:', methodContext, error);
        throw new Error('Failed on likeProperty');
    } finally {
        await this.client.release(); // Always release connection
    }
}

/**
 * Finds properties within a specified range of a user's location
 * @param userId ID of the user whose location will be used as center point
 * @param rangeInMeters Maximum distance in meters (default: 10000m = 10km)
 * @param onlyInRange If true, only returns properties within range (default: true)
 * @returns Promise resolving to array of properties
 */
public async findPropertiesWithinRange(
    userId: number,
    rangeInMeters: number = 10000,
    onlyInRange: boolean = true,
): Promise<PropertyInRange[]> {
    const methodContext = `${this.context} ::: findPropertiesWithinRange`;
    try {
        Logger.info('Finding properties', methodContext, {
            userId,
            rangeInMeters,
            onlyInRange,
        });
        // Build query based on whether we want only in-range properties
        const query = onlyInRange
            ? 'SELECT * FROM find_properties_within_range($1, $2) WHERE is_within_range = TRUE'
            : 'SELECT * FROM find_properties_within_range($1, $2)';

        // Execute the query
        const result = await this.client.query(query, [
            userId,
            rangeInMeters,
        ]);
        Logger.info('Properties found successfully', methodContext, {
            count: result.rows.length,
        });

        return result.rows;
    } catch (error) {
        Logger.error('Error finding properties:', methodContext, error);
        throw new Error(
            `Failed to find properties: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
    }
}

public async withdrawPropertyRequest(
    userId: string,
    propertyId: string,
): Promise<void> {
    const methodContext = `${this.context} ::: withdrawPropertyRequest`;
    try {
        Logger.info('Withdrawing property request', methodContext, {
            userId,
            propertyId,
        });
        // Begin transaction
        await this.client.beginTransaction();

        // Check if there's an existing pending request
        const { rows } = await this.client.query(
            `SELECT id FROM property_swipes 
                WHERE user_id = $1 AND property_id = $2 AND status = 'pending'`,
            [userId, propertyId],
        );

        if (rows.length === 0) {
            Logger.error('No pending request found', methodContext, {
                userId,
                propertyId,
            });
            throw new Error('No pending request found for this property');
        }

        // Update the request status to withdrawn
        await this.client.query(
            `UPDATE property_swipes 
                SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND property_id = $2`,
            [userId, propertyId],
        );

        // Record this action in the history table
        await this.client.query(
            `INSERT INTO property_swipe_history (user_id, property_id, action)
                VALUES ($1, $2, 'withdraw')`,
            [userId, propertyId],
        );

        Logger.info(
            'Property request withdrawn successfully',
            methodContext,
        );
        // Commit transaction
        await this.client.commit();
    } catch (error) {
        // Rollback on error
        await this.client.rollback();
        Logger.error(
            'Error on withdrawPropertyRequest:',
            methodContext,
            error,
        );
        throw error; // Preserving the original error message
    } finally {
        await this.client.release(); // Always release connection
    }
}

public async getPropertiesByStatus(
    userId: string,
    status?: string,
): Promise<IPropertySwipe[]> {
    const methodContext = `${this.context} ::: getPropertiesByStatus`;
    try {
        // Build the base query with JOIN to property_photos and conversations
        let query = `
            SELECT 
                p.id,
                p.title,
                p.description,
                ps.status,
                ps.created_at,
                c.name as city,
                s.name as state,
                co.name as country,
                u.first_name,
                u.last_name,
                COALESCE(
                    jsonb_agg(
                        DISTINCT jsonb_build_object(
                            'url', pp.photo_url
                        )
                    ) FILTER (WHERE pp.id IS NOT NULL),
                    '[]'::jsonb
                ) as photos,
                up.photo_url as host_profile_photo,
                (
                    SELECT conv.id
                    FROM conversations conv
                    WHERE conv.property_id = p.id 
                    AND conv.user_id = $1
                    AND conv.is_active = true
                    LIMIT 1
                ) as conversation_id
            FROM property_swipes ps
            JOIN properties p ON ps.property_id = p.id
            JOIN users u ON p.host_id = u.id
            JOIN locations l ON p.location_id = l.id
            JOIN cities c ON l.city_id = c.id
            LEFT JOIN states s ON c.state_id = s.id
            JOIN countries co ON c.country_id = co.id
            LEFT JOIN property_photos pp ON p.id = pp.property_id
            LEFT JOIN user_photos up ON u.id = up.user_id AND up.is_profile = true
            WHERE ps.user_id = $1
            AND ps.status IN ('pending', 'approved')
        `;

        const params = [userId];

        // Add status filter only if status is defined
        if (status !== undefined) {
            query += ` AND ps.status = $${params.length + 1}`;
            params.push(status);
        }

        // Group by all non-aggregated columns
        query += `
            GROUP BY 
                p.id, 
                p.title, 
                p.description, 
                ps.status, 
                ps.created_at, 
                c.name, 
                s.name, 
                co.name, 
                up.photo_url, 
                u.first_name, 
                u.last_name
        `;

        // Add ordering
        query += ` ORDER BY ps.created_at DESC`;

        const { rows } = await this.client.query(query, params);

        Logger.info(
            'Properties fetched successfully by status',
            methodContext,
            {
                count: rows.length,
            },
        );

        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status,
            location: row.city + ', ' + (row.state ?? row.country),
            photos: row.photos?.map((i: { url: string }) => i.url) ?? [],
            created_at: row.created_at,
            host: {
                first_name: row.first_name,
                last_name: row.last_name,
                photo_url: row.host_profile_photo,
            },
            conversation_id: row.conversation_id,
        }));
    } catch (error) {
        Logger.error(
            'Error in getPropertiesByStatus:',
            methodContext,
            error,
        );
        throw new Error('Failed to get pending properties');
    }
}

public async getHostProperties(
    hostId: string,
): Promise<IPropertyDisplay[]> {
    const methodContext = this.context + ' - getHostProperties';
    try {
        Logger.info('Fetching properties owned by host', methodContext, {
            hostId,
        });

        const result = await this.client.query(
            `
            WITH items AS (
                SELECT 
                    property_id,
                    amenity_id as id,
                    a.name,
                    a.icon,
                    'amenity' as type
                FROM property_amenities pa
                JOIN amenities a ON pa.amenity_id = a.id
                UNION ALL
                SELECT 
                    property_id,
                    style_id as id,
                    s.name,
                    s.icon,
                    'style' as type
                FROM property_styles ps
                JOIN styles s ON ps.style_id = s.id
                UNION ALL
                SELECT 
                    p.id as property_id,
                    pt.id,
                    pt.name,
                    pt.icon,
                    'type' as type
                FROM properties p
                JOIN place_types pt ON p.place_type_id = pt.id
            ),
            property_data AS (
                SELECT 
                    p.*,
                    json_agg(DISTINCT pp.photo_url) as photos,
                    json_agg(DISTINCT
                        jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'icon', i.icon,
                            'type', i.type
                        )
                    ) as place_items,
                    jsonb_build_object(
                        'photo_url', u.photo_url,
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    ) as host,
                    json_agg(DISTINCT jsonb_build_object(
                        'start_date', pd.start_date,
                        'end_date', pd.end_date,
                        'price', pd.price_per_night
                    )) as dates,
                    c.name as city,
                    co.name as country,
                    (
                        SELECT COUNT(*) 
                        FROM property_swipes ps
                        WHERE ps.property_id = p.id AND ps.status = 'pending'
                    ) as pending_requests_count
                FROM properties p
                LEFT JOIN property_photos pp ON p.id = pp.property_id
                LEFT JOIN items i ON p.id = i.property_id
                LEFT JOIN users u ON p.host_id = u.id
                LEFT JOIN locations l ON p.location_id = l.id
                LEFT JOIN cities c ON l.city_id = c.id
                LEFT JOIN countries co ON c.country_id = co.id
                LEFT JOIN property_dates pd ON p.id = pd.property_id
                WHERE p.host_id = $1
                AND p.deleted_at IS NULL
                GROUP BY p.id, u.photo_url, u.first_name, u.last_name, c.name, co.name
            )
            SELECT 
                id,
                title,
                beds,
                bathrooms,
                bedrooms,
                max_guests,
                roommates,
                size_sqm,
                dates,
                photos,
                place_items,
                host,
                city,
                country,
                pending_requests_count,
                created_at,
                updated_at
            FROM property_data
            ORDER BY created_at DESC
            `,
            [hostId],
        );

        Logger.info(
            'Properties owned by host fetched successfully',
            methodContext,
            {
                count: result.rows.length,
            },
        );

        // Transform the results to match IProperty interface
        return result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            location: row.city + ', ' + row.country,
            photos: row.photos?.filter((i: string | null) => i) ?? [],
        }));
    } catch (error) {
        Logger.error(
            'Error fetching properties owned by host',
            methodContext,
            error,
        );
        throw new Error('Failed to fetch properties owned by host');
    }
}

public async deleteProperty(propertyId: string): Promise<void> {
    const methodContext = `${this.context} ::: deleteProperty`;
    try {
        Logger.info('Deleting property', methodContext, { propertyId });
        await this.client.query(
            `UPDATE properties SET deleted_at = CURRENT_TIMESTAMP
                WHERE id = $1`,
            [propertyId],
        );
        Logger.info('Property deleted successfully', methodContext);
    } catch (error) {
        Logger.error('Error deleting property:', methodContext, error);
        throw new Error('Failed to delete property');
    }
}

public async updateProperty(
    propertyId: string,
    input: IPropertyUpdateInput,
    userId: string,
): Promise<void> {
    const methodContext = this.context + ' - updateProperty';
    try {
        Logger.info('Starting property update', methodContext, {
            propertyId,
            userId,
        });

        await this.client.beginTransaction();

        // Verify ownership
        const ownershipQuery = `
            SELECT id, location_id FROM properties 
            WHERE id = $1 AND host_id = $2`;

        const ownershipResult = await this.client.query(ownershipQuery, [
            propertyId,
            userId,
        ]);

        if (ownershipResult.rows.length === 0) {
            throw new Error('Property not found or unauthorized');
        }

        const existingLocationId = ownershipResult.rows[0].location_id;

        // Update location if any location fields changed
        if (
            input.location_item?.city_id ||
            input.address ||
            input.latitude ||
            input.longitude
        ) {
            Logger.info('Updating location', methodContext);

            const locationUpdateFields = [];
            const locationValues = [existingLocationId];
            let paramCount = 2;

            if (input.location_item?.city_id) {
                locationUpdateFields.push(`city_id = $${paramCount}`);
                locationValues.push(input.location_item.city_id);
                paramCount++;
            }

            if (input.address) {
                locationUpdateFields.push(`address = $${paramCount}`);
                locationValues.push(input.address);
                paramCount++;
            }

            if (input.longitude && input.latitude) {
                locationUpdateFields.push(
                    `coordinates = ST_SetSRID(ST_MakePoint($${paramCount}, $${paramCount + 1}), 4326)::geography`,
                );
                locationValues.push(input.longitude);
                locationValues.push(input.latitude);
            }

            if (locationUpdateFields.length > 0) {
                const locationQuery = `
                    UPDATE locations 
                    SET ${locationUpdateFields.join(', ')}
                    WHERE id = $1`;

                await this.client.query(locationQuery, locationValues);
                Logger.info('Location updated', methodContext);
            }
        }

        // Update main property fields
        const propertyUpdateFields = [];
        const propertyValues: any[] = [propertyId];
        let paramCount = 2;

        if (input.type_id !== undefined) {
            propertyUpdateFields.push(`place_type_id = $${paramCount}`);
            propertyValues.push(input.type_id);
            paramCount++;
        }

        if (input.title !== undefined) {
            propertyUpdateFields.push(`title = $${paramCount}`);
            propertyValues.push(input.title);
            paramCount++;
        }

        if (input.description !== undefined) {
            propertyUpdateFields.push(`description = $${paramCount}`);
            propertyValues.push(input.description);
            paramCount++;
        }

        if (input.last_minute_offer !== undefined) {
            propertyUpdateFields.push(
                `last_minute_enabled = $${paramCount}`,
            );
            propertyValues.push(input.last_minute_offer);
            paramCount++;
        }

        // Update basics
        if (input.basics) {
            if (input.basics.max_guests !== undefined) {
                propertyUpdateFields.push(`max_guests = $${paramCount}`);
                propertyValues.push(input.basics.max_guests);
                paramCount++;
            }
            if (input.basics.bedrooms !== undefined) {
                propertyUpdateFields.push(`bedrooms = $${paramCount}`);
                propertyValues.push(input.basics.bedrooms);
                paramCount++;
            }
            if (input.basics.beds !== undefined) {
                propertyUpdateFields.push(`beds = $${paramCount}`);
                propertyValues.push(input.basics.beds);
                paramCount++;
            }
            if (input.basics.bathrooms !== undefined) {
                propertyUpdateFields.push(`bathrooms = $${paramCount}`);
                propertyValues.push(input.basics.bathrooms);
                paramCount++;
            }
            if (input.basics.roommates !== undefined) {
                propertyUpdateFields.push(`roommates = $${paramCount}`);
                propertyValues.push(input.basics.roommates);
                paramCount++;
            }
            if (input.basics.size_sqm !== undefined) {
                propertyUpdateFields.push(`size_sqm = $${paramCount}`);
                propertyValues.push(input.basics.size_sqm);
                paramCount++;
            }
            if (input.basics.parking_spot !== undefined) {
                propertyUpdateFields.push(`parking_spot = $${paramCount}`);
                propertyValues.push(input.basics.parking_spot);
                paramCount++;
            }
        }

        if (propertyUpdateFields.length > 0) {
            const propertyQuery = `
                UPDATE properties 
                SET ${propertyUpdateFields.join(', ')}
                WHERE id = $1`;

            await this.client.query(propertyQuery, propertyValues);
            Logger.info('Property record updated', methodContext);
        }

        // Update dates and price if provided
        if (
            input.start_date ||
            input.end_date ||
            input.price !== undefined
        ) {
            Logger.info('Updating property dates and price', methodContext);

            const dateUpdateFields = [];
            const dateValues: any[] = [propertyId];
            let paramCount = 2;

            if (input.start_date) {
                dateUpdateFields.push(`start_date = $${paramCount}`);
                dateValues.push(input.start_date);
                paramCount++;
            }
            if (input.end_date) {
                dateUpdateFields.push(`end_date = $${paramCount}`);
                dateValues.push(input.end_date);
                paramCount++;
            }
            if (input.price !== undefined) {
                dateUpdateFields.push(`price_per_night = $${paramCount}`);
                dateValues.push(input.price);
                paramCount++;
            }

            if (dateUpdateFields.length > 0) {
                const dateQuery = `
                    UPDATE property_dates 
                    SET ${dateUpdateFields.join(', ')}
                    WHERE property_id = $1`;

                await this.client.query(dateQuery, dateValues);
            }
        }

        // Update junction tables if arrays provided
        const updateJunctionTable = async (
            table: string,
            key_id: string,
            ids: number[],
        ) => {
            // Delete existing records
            await this.client.query(
                `DELETE FROM ${table} WHERE property_id = $1`,
                [propertyId],
            );

            // Insert new records
            if (ids.length > 0) {
                const values = ids
                    .map((id, index) => `($1, $${index + 2})`)
                    .join(',');
                const query = `
                    INSERT INTO ${table} (property_id, ${key_id})
                    VALUES ${values}`;
                await this.client.query(query, [propertyId, ...ids]);
            }
        };

        const junctionUpdates = [];

        if (input.amenities_id !== undefined) {
            junctionUpdates.push(
                updateJunctionTable(
                    'property_amenities',
                    'amenity_id',
                    input.amenities_id,
                ),
            );
        }

        if (input.styles_id !== undefined) {
            junctionUpdates.push(
                updateJunctionTable(
                    'property_styles',
                    'style_id',
                    input.styles_id,
                ),
            );
        }

        if (input.rules_id !== undefined) {
            junctionUpdates.push(
                updateJunctionTable(
                    'property_rules',
                    'rule_id',
                    input.rules_id,
                ),
            );
        }

        if (junctionUpdates.length > 0) {
            await Promise.all(junctionUpdates);
            Logger.info('Junction records updated', methodContext);
        }

        Logger.info('Property updated successfully', methodContext, {
            propertyId,
        });

        await this.client.commit();
    } catch (error) {
        await this.client.rollback();
        Logger.error('Error updating property', methodContext, error);
        throw new Error('Failed to update property');
    } finally {
        await this.client.release(); // Always release connection
    }
}

public async getPropertyPhotos(propertyId: string): Promise<string[]> {
    const methodContext = `${this.context} ::: getPropertyPhotos`;
    try {
        Logger.info('Fetching property photos', methodContext, {
            propertyId,
        });
        const result = await this.client.query(
            `SELECT photo_url FROM property_photos WHERE property_id = $1`,
            [propertyId],
        );

        if (result.rows.length === 0) {
            Logger.error(
                'No photos found for this property',
                methodContext,
                {
                    propertyId,
                },
            );
            return [];
        }

        Logger.info('Property photos fetched successfully', methodContext);
        return result.rows.map((row) => row.photo_url);
    } catch (error) {
        Logger.error(
            'Error fetching property photos:',
            methodContext,
            error,
        );
        throw new Error('Failed to fetch property photos');
    }
}
}

export default PropertyService;
