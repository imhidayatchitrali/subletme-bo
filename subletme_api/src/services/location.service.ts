import { Client } from '../database';
import { geocodeAndUpdateCity } from '../helpers/location.helper';
import { ILocation } from '../models/location.model';
import Logger from '../utils/logger';

class LocationService {
    private client: Client;
    private context: string;
    constructor() {
        this.context = 'LocationService';
        this.client = new Client();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public async getLocations(): Promise<ILocation[]> {
        const methodContext = this.context + ' - getLocations';
        try {
            Logger.info('Fetching all locations', methodContext);

            const query = `
                SELECT 
                    co.id as country_id,
                    co.name as country_name,
                    c.id as city_id,
                    c.name as city_name,
                    s.id as state_id,
                    s.name as state_name
                FROM countries co 
                JOIN cities c ON co.id = c.country_id
                LEFT JOIN states s ON c.state_id = s.id
                ORDER BY co.name, c.name
            `;

            Logger.info('Executing query', methodContext);
            const result = await this.client.query(query);

            Logger.info('Retrieved locations', methodContext, {
                count: result.rows.length,
            });
            return result.rows as ILocation[];
        } catch (error: any) {
            Logger.error(
                'Error fetching locations',
                methodContext,
                error.message,
            );
            throw new Error('Failed to fetch locations');
        }
    }

    public async getLocationById(id: number): Promise<ILocation | null> {
        const methodContext = this.context + ' - getLocationById';
        try {
            Logger.info('Fetching location', methodContext, id);

            const query = `
                SELECT 
                    co.id as country_id,
                    co.name as country_name,
                    c.id as city_id,
                    c.name as city_name,
                    s.id as state_id,
                    s.name as state_name
                FROM countries co 
                JOIN cities c ON co.id = c.country_id
                LEFT JOIN states s ON c.state_id = s.id
                WHERE c.id = $1
            `;

            Logger.info('Executing query', methodContext, id);
            const result = await this.client.query(query, [id]);

            if (result.rows.length === 0) {
                Logger.info('No location found', methodContext, id);
                return null;
            }

            Logger.info('Retrieved location successfully', methodContext, id);
            return result.rows[0] || null;
        } catch (error: any) {
            Logger.error('Error fetching location', methodContext, {
                id,
                error: error.message,
            });
            throw new Error('Failed to fetch location');
        }
    }

    public async populateAllCityCoordinates(): Promise<void> {
        const methodContext = this.context + ' - populateAllCityCoordinates';
        try {
            // Get all cities with NULL coordinates, joining with states and countries
            const result = await this.client.query(`
        SELECT 
            c.id AS city_id,
            c.name AS city_name,
            s.name AS state_name,
            s.code AS state_code,
            co.name AS country_name,
            co.code AS country_code
        FROM 
            cities c
            LEFT JOIN states s ON c.state_id = s.id
            JOIN countries co ON COALESCE(s.country_id, c.country_id) = co.id
        WHERE 
            c.coordinates IS NULL
      `);

            const cities = result.rows;
            console.log(`Found ${cities.length} cities without coordinates`);

            // Process in batches to avoid overloading the geocoding API
            const batchSize = 10;
            for (let i = 0; i < cities.length; i += batchSize) {
                const batch = cities.slice(i, i + batchSize);
                console.log(
                    `Processing batch ${i / batchSize + 1} of ${Math.ceil(cities.length / batchSize)}`,
                );

                const promises = batch.map((city) =>
                    this.geocodeAndUpdateCity(city),
                );
                await Promise.all(promises);

                // Sleep to respect API rate limits
                if (i + batchSize < cities.length) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }

            console.log('City coordinates population completed');
        } catch (error: any) {
            console.error(
                'Error populating city coordinates',
                methodContext,
                error.message,
            );
            throw new Error(
                `Error populating city coordinates: ${error.message}`,
            );
        }
    }

    private async geocodeAndUpdateCity(city: any): Promise<void> {
        try {
            // Construct the address string for geocoding
            const addressParts = [city.city_name];
            if (city.state_name) addressParts.push(city.state_name);
            addressParts.push(city.country_name);
            const address = addressParts.join(', ');

            console.log(`Geocoding: ${address}`);

            // Call geocoding API (this example uses Google Maps API)
            // Replace with your preferred geocoding service
            const response = await geocodeAndUpdateCity(address);
            // Update the city record with coordinates and radius
            await this.client.query(
                `
          UPDATE cities 
          SET 
            coordinates = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            radius = $3
          WHERE id = $4
        `,
                [
                    response.longitude,
                    response.latitude,
                    response.radius,
                    city.city_id,
                ],
            );
            Logger.info(
                `Updated city ${city.city_name} (${city.city_id}) with coordinates`,
                this.context + ' - geocodeAndUpdateCity',
                {
                    city_id: city.city_id,
                    coordinates: {
                        longitude: response.longitude,
                        latitude: response.latitude,
                    },
                    radius: response.radius,
                },
            );
        } catch (error: any) {
            console.error(
                `Error geocoding city ${city.city_name} (${city.city_id}): ${error.message}`,
            );
            // Continue with other cities even if one fails
        }
    }
}

export default LocationService;
