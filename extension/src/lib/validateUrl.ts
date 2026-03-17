export function validateUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) return false;

    // Accept both full URLs and plain domains like "example.com"
    try {
        new URL(trimmed);
        return true;
    } catch {
        try {
            new URL(`https://${trimmed}`);
            return true;
        } catch {
            return false;
        }
    }
}