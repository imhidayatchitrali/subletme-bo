// Helper function to calculate average rating
export const calculateAverageRating = (
    reviews: Array<{ rating: number }>,
): number => {
    if (!reviews.length) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return Number((sum / reviews.length).toFixed(1));
};

export const parseNumericParam = (
    value: string | undefined,
    ignoreZero = false,
) => {
    if (value === undefined) return undefined;

    const parsed = parseInt(value);

    // Check if parsed value is a valid number and not zero (if ignoreZero is true)
    if (isNaN(parsed) || (ignoreZero && parsed === 0)) {
        return undefined;
    }

    return parsed;
};

export function parseCityIds(cityIdsString: string | undefined): number[] {
    if (!cityIdsString) {
        return [];
    }

    return cityIdsString
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));
}
