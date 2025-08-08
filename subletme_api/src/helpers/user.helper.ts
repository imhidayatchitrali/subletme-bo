import { IUser } from '../models/user.model';

export const convertToDBObject = (value: string): Date | null => {
    // Split the date string into components
    const [month, day, year] = value.split('/').map(Number);

    // Create a proper Date object (note: month is 0-based in JS Date)
    const dateOfBirth = new Date(year, month - 1, day);

    // Validate the date
    if (
        dateOfBirth.getMonth() !== month - 1 ||
        dateOfBirth.getDate() !== day ||
        dateOfBirth.getFullYear() !== year ||
        year < 1900 ||
        dateOfBirth > new Date()
    ) {
        return null;
    }

    return dateOfBirth;
};

export const getProfileProgress = (user: IUser): number => {
    const totalSteps = 6;
    let completedSteps = 0;

    if (user.first_name) completedSteps++;
    if (user.last_name) completedSteps++;
    if (user.date_of_birth) completedSteps++;
    if (user.photos && user.photos.length === 6) completedSteps++;
    if (user.instagram_username) completedSteps++;
    if (user.facebook_username) completedSteps++;

    const progress = (completedSteps / totalSteps) * 100;
    return Math.round(progress);
};
