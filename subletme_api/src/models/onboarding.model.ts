export enum OnboardingStep {
    PERSONAL_INFO = 'personal_info',
    PHONE_VERIFICATION = 'phone_verification',
    PHOTO_UPLOAD = 'photo_upload',
    COMPLETED = 'completed',
}

export type PersonalInfoDTO = {
    first_name: string;
    last_name: string;
    email: string;
    date_of_birth: string;
    password: string;
    platform: string;
};

export type SignupUserDBInsert = {
    first_name: string;
    last_name: string;
    email: string;
    date_of_birth: Date;
    password: string;
    platform: string;
    onboardingStep: OnboardingStep;
};

export type PhoneVerificationDTO = {
    phoneNumber: string;
    verificationCode: string;
};

export type PhotoUploadDTO = {
    photoUrl: string;
};
