export type IAppVersion = {
    id: number;
    version: string;
    iosBuildNumber: number;
    androidBuildNumber: number;
    environment: Environment;
    updatedAt: Date;
    requiredUpdate: boolean;
    message: string | null;
    iosDownloadUrl: string | null;
    androidDownloadUrl: string | null;
};

export type IAppVersionResponse = {
    version: string;
    build_number: number;
    environment: Environment;
    required_update: boolean;
    message: string | null;
    download_url: string | null;
};

export enum Environment {
    DEVELOP = 'develop',
    PRODUCTION = 'production',
}
