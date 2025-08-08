export const isValidDate = (dateString: string): boolean => {
    const [month, day, year] = dateString.split('/').map(Number);
    const date = new Date(year, month - 1, day);

    return (
        date.getMonth() === month - 1 &&
        date.getDate() === day &&
        date.getFullYear() === year &&
        year >= 1900 && // Reasonable minimum year
        year <= new Date().getFullYear()
    ); // Not future date
};
