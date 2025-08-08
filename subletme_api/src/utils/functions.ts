export function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function replaceAnswersInText(
    input: string,
    replacements: { [key: string]: any },
): string {
    let result = input;
    if (!replacements) {
        return result;
    }
    const replacementsMap = new Map<string, string>(
        Object.entries(replacements),
    );
    replacementsMap.forEach((v, k) => {
        result = result.replace(new RegExp(`#${k}`, 'g'), v.toString());
    });
    return result;
}

export function capitalizeText(text: string | null): string {
    if (!text) {
        return '';
    }
    return text
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function removeLastSymbolFromText(text: string | null): string {
    if (!text) {
        return '';
    }
    return text.slice(0, -1);
}

export function combineArrays(...arrays: string[][]): string[][] {
    if (arrays.length === 0) {
        return [];
    }
    // Determine the length of the shortest array to ensure we don't access undefined elements
    const minLength = Math.min(...arrays.map((arr) => arr.length));

    // Initialize an empty array to hold the combined elements
    const combinedArray: string[][] = [];

    // Iterate up to the length of the shortest array
    for (let i = 0; i < minLength; i++) {
        // Combine elements from each array at the current index, separated by commas
        combinedArray.push(arrays.map((arr) => arr[i].toString()));
    }

    return combinedArray;
}

export const extractDisplayOrdersFromBody = (body: any): number[] => {
    if (!body) return [];

    const displayOrders: number[] = [];
    const regex = /^displayOrder_(\d+)$/;

    // Loop through all keys in the body
    for (const key in body) {
        const match = key.match(regex);

        if (match) {
            const orderValue = parseInt(body[key]);

            if (!isNaN(orderValue)) {
                displayOrders.push(orderValue);
            }
        }
    }

    // Sort the display orders numerically
    return displayOrders.sort((a, b) => a - b);
};
