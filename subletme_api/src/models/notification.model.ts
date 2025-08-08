export type NotificationPayload = {
    title: string;
    body: string;
    imageUrl?: string;
    data?: NotificationData;
    device_os?: string;
};

export type NotificationData = {
    [key: string]: string;
};

export type DeviceMetadata = {
    device_id: string;
    device_model: string;
    device_brand: string;
    device_type: string;
    app_version: string;
};
