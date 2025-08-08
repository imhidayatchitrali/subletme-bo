import { ILocation } from './location.model';
import { IHostProperty } from './user.model';

export type IPlaceItem = {
    id: string;
    name: string;
    icon: string;
};

export type IResponseData = {
    types: IPlaceItem[];
    amenities: IPlaceItem[];
    styles: IPlaceItem[];
    rules: IPlaceItem[];
    locations: ILocation[];
};

export type IPropertyPublishInput = {
    title: string;
    description: string;
    place_type_id: number;
    location_item: {
        city_id: number;
    };
    basics: {
        max_guests: number;
        bedrooms: number;
        beds: number;
        bathrooms: number;
        roommates: number;
        size_sqm: number;
        parking_spot?: boolean;
    };
    styles_id: number[];
    amenities_id: number[];
    rules_id: number[];
    address: string;
    price: number;
    last_minute_offer: boolean;
    start_date: string;
    end_date: string;
    latitude: number;
    longitude: number;
    photos?: string[];
};

export type IProperty = {
    id: string;
    price: number;
    guests: number;
    bedrooms: number;
    beds: number;
    bathrooms: number;
    parking_spot: boolean;
    host_id: string;
    roommates: number;
    size: number;
    photos: string[];
    place_items: IPlaceItem[];
    host: IHostProperty;
    city: string;
    country: string;
    distance?: number; // meters
};

export type IPropertyDisplay = {
    id: string;
    title: string;
    photos: string[];
    location: string;
};

export type IPropertyDetail = {
    title: string;
    description: string;
    rules: string[];
    rating: number;
    reviews: Array<{
        id: string;
        rating: number;
        comment: string;
        created_at: Date;
        user: {
            id: string;
            first_name: string;
            last_name: string;
            photo_url: string;
        };
    }>;
    location: {
        address: string;
        coordinates: {
            type: 'Point';
            coordinates: [number, number]; // [longitude, latitude]
        };
        city: string;
        country: string;
        postal_code: string;
    };
    host: {
        id: string;
        photo_url: string;
        first_name: string;
        last_name: string;
        bio: string;
    };
} & IProperty;

export type PropertySwipe = {
    userId: number;
    propertyId: number;
    isLike: boolean;
};

// Define the return type matching your PostgreSQL function
export type PropertyInRange = {
    property_id: number;
    property_title: string;
    host_id: number;
    address: string;
    city_name: string;
    distance_meters: number;
    max_guests: number;
    bedrooms: number;
    beds: number;
    bathrooms: number;
    is_within_range: boolean;
};

export type IPropertySwipe = {
    id: string;
    title: string;
    status: string;
    host: IHostProperty;
    location: string;
    conversation_id: string;
    photos: string[];
};

export type IPropertyUpdateInput = {
    title?: string;
    description?: string;
    type_id?: number;
    location_item?: {
        city_id?: number;
    };
    basics?: {
        max_guests?: number;
        bedrooms?: number;
        beds?: number;
        bathrooms?: number;
        roommates?: number;
        size_sqm?: number;
        parking_spot?: boolean;
    };
    styles_id?: number[];
    amenities_id?: number[];
    rules_id?: number[];
    current_photos?: string[];
    address?: string;
    price?: number;
    last_minute_offer?: boolean;
    start_date?: string;
    end_date?: string;
    latitude?: number;
    longitude?: number;
    photos?: string[];
};

export type IPropertyById = {
    id: string;
    host_id: number;
    city_id: number;
    location_id: number;
    country_id: number;
    address: string;
    max_guests: number;
    bedrooms: number;
    beds: number;
    bathrooms: number;
    roommates: number;
    size_sqm: number;
    title: string;
    description: string;
    last_minute_enabled: boolean;
    parking_spot: boolean;
};
