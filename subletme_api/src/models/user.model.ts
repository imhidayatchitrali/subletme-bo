import { AddressComponent } from './address.model';
import { OnboardingStep } from './onboarding.model';

export type IUser = {
    id: string;
    email: string;
    google_id?: string;
    apple_id?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    onboarding_step: OnboardingStep;
    photo_url?: string;
    photos?: IUserPhoto[];
    gender?: string;
    refresh_token?: string;
    hash_password?: string;
    language: string;
    location?: number;
    user_devices?: IUserDevice[];
    created_at?: Date;
    updated_at?: Date;
    latitude?: number;
    longitude?: number;
    is_host: boolean;
    address?: AddressComponent;
    instagram_username?: string;
    facebook_username?: string;
};


export type Photo = {
    id: number;
    url: string;
    isProfile: boolean;
    displayOrder: number;
}

export type IUserInput = {
    id?: string;
    refresh_token?: string;
    photo_url?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    google_id?: string;
    apple_id?: string;
    platform?: string;
    onboarding_step: OnboardingStep;
};

export type IUserUpdateInput = {
    photo_url?: string;
    first_name?: string;
    last_name?: string;
    gender?: string;
    email?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    instagram?: string;
    facebook?: string;
};

export type IHostProperty = {
    id?: string;
    photo_url?: string;
    first_name?: string;
    last_name?: string;
};

export type IUserDevice = {
    id?: string;
    firebase_token?: string;
    device_metadata?: IDeviceMetadata;
};

export type IDeviceMetadata = {
    device_id?: string;
    app_version?: string;
    device_type?: string;
    device_brand?: string;
    device_model?: string;
};

export type IUserProfile = {
    id: number;
    bio: string;
    photos: string[];
    first_name: string;
    last_name: string;
    date_of_birth: string;
    distance: number;
};

export type IUserRequest = {
    id: number;
    bio: string;
    photos: string[];
    location: string;
    first_name: string;
    last_name: string;
    created_at: string;
    date_of_birth: string;
    status: string;
    conversation_id?: number;
    distance: number;
    property: {
        id: number;
        title: string;
    };
};

export type IUserPhoto = {
    id: number;
    url: string;
    is_profile: boolean;
    display_order: number;
};

export type IOtherUserConversation = {
    other_user_id: number;
    other_user_first_name: string;
    other_user_last_name: string;
    other_user_photo: string | null;
    property_title: string;
};
