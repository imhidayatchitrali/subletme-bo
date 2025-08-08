export type HelperModal = {
    id: number;
    code: string;
    route_path: string;
    image_url: string;
    description: string;
    button_text: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
};

export type AddHelperModalRequest = {
    code: string;
    routePath: string;
    imageUrl: string;
    description: string;
    buttonText: string;
};
