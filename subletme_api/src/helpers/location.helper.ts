import axios from 'axios';
import { AddressComponent } from '../models/address.model';
import Logger from '../utils/logger';

type Coordinates = {
    latitude: number;
    longitude: number;
};

/**
 * Gets coordinates (latitude, longitude) from a given address using Google Maps Geocoding API
 * @param address The address to geocode
 * @returns Promise resolving to coordinates or null if geocoding fails
 */
export async function getCoordinatesFromAddress(
    address: string,
): Promise<Coordinates> {
    const methodContext = 'LocationHelper - getCoordinatesFromAddress';
    try {
        // Encode the address for URL
        Logger.info('Address to geocode:', methodContext, address);
        const encodedAddress = encodeURIComponent(address);
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        // Make request to Google Maps Geocoding API
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`,
        );

        const data = response.data;

        // Check if the API returned results
        if (
            data.status !== 'OK' ||
            !data.results ||
            data.results.length === 0
        ) {
            Logger.error('Geocoding failed', methodContext, data.status);
            return { latitude: 0, longitude: 0 };
        }

        // Extract coordinates from the first result
        const location = data.results[0].geometry.location;
        Logger.info('Geocoding result', methodContext, location);
        return {
            latitude: location.lat,
            longitude: location.lng,
        };
    } catch (error) {
        Logger.error('Error geocoding address', methodContext, error);
        throw error;
    }
}

export async function geocodeAndUpdateCity(
    address: string,
): Promise<{ latitude: number; longitude: number; radius: number }> {
    const methodContext = 'LocationHelper - geocodeAndUpdateCity';
    try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        const response = await axios.get(
            'https://maps.googleapis.com/maps/api/geocode/json',
            {
                params: {
                    address,
                    key: apiKey,
                },
            },
        );
        Logger.info('Geocoding response:', methodContext, response.data);
        if (
            response.data.status !== 'OK' ||
            response.data.results.length === 0
        ) {
        }
        const location = response.data.results[0].geometry.location;
        const { lat, lng } = location;

        // Determine appropriate radius based on result type
        let radius = 5000; // Default 5km
        const types = response.data.results[0].types || [];
        if (
            types.includes('locality') ||
            types.includes('administrative_area_level_2')
        ) {
            radius = 10000; // 10km for cities
        } else if (types.includes('administrative_area_level_1')) {
            radius = 50000; // 50km for states/provinces
        } else if (types.includes('country')) {
            radius = 200000; // 200km for countries
        }
        return {
            latitude: lat,
            longitude: lng,
            radius: radius,
        };
    } catch (error: any) {
        Logger.error(`Error geocoding address ${address}`, methodContext);
        return {
            latitude: 0,
            longitude: 0,
            radius: 0,
        };
    }
}

/**
 * Gets address information (city, country) from coordinates using Google Maps Reverse Geocoding API
 * @param latitude The latitude coordinate
 * @param longitude The longitude coordinate
 * @returns Promise resolving to address components or null if reverse geocoding fails
 */
export async function getAddressFromCoordinates(
    latitude?: number,
    longitude?: number,
): Promise<AddressComponent | null> {
    const methodContext = 'LocationHelper - getAddressFromCoordinates';
    try {
        Logger.info('Coordinates to reverse geocode:', methodContext, {
            latitude,
            longitude,
        });
        if (!latitude || !longitude) {
            return null;
        }
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;

        // Make request to Google Maps Reverse Geocoding API
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`,
        );

        const data = response.data;
        Logger.info('Reverse geocoding response:', methodContext, data);

        // Check if the API returned results
        if (
            data.status !== 'OK' ||
            !data.results ||
            data.results.length === 0
        ) {
            Logger.error(
                'Reverse geocoding failed',
                methodContext,
                data.status,
            );
            return null;
        }

        // Extract address components from the first result
        const result = data.results[0];
        const addressComponents = result.address_components;
        const formattedAddress = result.formatted_address;

        let city: string | undefined;
        let country: string | undefined;

        // Extract city and country from address components
        for (const component of addressComponents) {
            const types = component.types;

            // Find city component (could be locality, sublocality, or administrative_area_level_2)
            if (
                types.includes('locality') ||
                types.includes('sublocality') ||
                types.includes('administrative_area_level_2')
            ) {
                city = city || component.long_name; // Only set if not already found
            }

            // Find country component
            if (types.includes('country')) {
                country = component.long_name;
            }
        }
        Logger.info('Reverse geocoding result:', methodContext, {
            city,
            country,
            formattedAddress,
        });
        return {
            city,
            country,
            formatted_address: formattedAddress,
        };
    } catch (error) {
        Logger.error(
            'Error reverse geocoding coordinates',
            methodContext,
            error,
        );
        throw error;
    }
}
